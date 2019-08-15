import * as R from 'ramda';
import { parsePrivateKey } from 'sshpk';
import { logger } from '@lagoon/commons/src/local-logging';
import { keycloakAdminClient } from '../../clients/keycloakClient';
import { getSqlClient } from '../../clients/sqlClient';
import { query, prepare } from '../../util/db';
import { Group, GroupNotFoundError } from '../../models/group';
import { User } from '../../models/user';
import {
  generatePrivateKey,
  getSshKeyFingerprint,
} from '../../resources/sshKey';
import {
  selectUserIdsBySshKeyFingerprint,
  insertSshKey,
  addSshKeyToUser,
} from '../../resources/sshKey/sql';

const generatePrivateKeyEd25519 = R.partial(generatePrivateKey, ['ed25519']);

const keycloakAuth = {
  username: 'admin',
  password: R.pathOr(
    '<password not set>',
    ['env', 'KEYCLOAK_ADMIN_PASSWORD'],
    process,
  ) as string,
  grantType: 'password',
  clientId: 'admin-cli',
};

(async () => {
  keycloakAdminClient.setConfig({ realmName: 'master' });
  await keycloakAdminClient.auth(keycloakAuth);
  keycloakAdminClient.setConfig({ realmName: 'lagoon' });

  const sqlClient = getSqlClient();

  // Copy private keys from customer to projects if the project has no private key
  await query(
    sqlClient,
    `UPDATE project p
    INNER JOIN customer c ON p.customer = c.id
    SET p.private_key = c.private_key
    WHERE p.private_key IS NULL`,
  );

  const GroupModel = Group();
  const UserModel = User();

  const projectRecords = await query(sqlClient, 'SELECT * FROM `project`');

  for (const project of projectRecords) {
    logger.debug(`Processing ${project.name}`);

    // Add or update group
    const projectGroupName = `project-${project.name}`;
    let keycloakGroup;
    try {
      const existingGroup = await GroupModel.loadGroupByName(projectGroupName);
      keycloakGroup = await GroupModel.updateGroup({
        id: existingGroup.id,
        name: existingGroup.name,
        attributes: {
          ...existingGroup.attributes,
          type: ['project-default-group'],
          'lagoon-projects': [project.id],
        },
      });
    } catch (err) {
      if (err instanceof GroupNotFoundError) {
        try {
          keycloakGroup = await GroupModel.addGroup({
            name: projectGroupName,
            attributes: {
              type: ['project-default-group'],
              'lagoon-projects': [project.id],
            },
          });
        } catch (err) {
          logger.error(
            `Could not add group ${projectGroupName}: ${err.message}`,
          );
          continue;
        }
      } else {
        logger.error(
          `Could not update group ${projectGroupName}: ${err.message}`,
        );
      }
    }

    // Add project users to group
    const projectUserQuery = prepare(
      sqlClient,
      'SELECT u.email FROM project_user pu LEFT JOIN user u on pu.usid = u.id WHERE pu.pid = :pid',
    );
    const projectUserRecords = await query(
      sqlClient,
      projectUserQuery({
        pid: project.id,
      }),
    );

    for (const projectUser of projectUserRecords) {
      try {
        const user = await UserModel.loadUserByUsername(projectUser.email);
        await GroupModel.addUserToGroup(user, keycloakGroup, 'owner');
      } catch (err) {
        logger.error(
          `Could not add user (${projectUser.email}) to group (${
            keycloakGroup.name
          }): ${err.message}`,
        );
      }
    }

    let keyPair = {} as any;
    try {
      const privateKey = R.cond([
        [R.isNil, generatePrivateKeyEd25519],
        [R.isEmpty, generatePrivateKeyEd25519],
        [R.T, parsePrivateKey],
      ])(R.prop('privateKey', project));

      const publicKey = privateKey.toPublic();

      keyPair = {
        ...keyPair,
        private: R.replace(/\n/g, '\n', privateKey.toString('openssh')),
        public: publicKey.toString(),
      };
    } catch (err) {
      logger.error(
        `There was an error with the project (${project.name}) privateKey: ${
          err.message
        }`,
      );
      logger.error(
        `Skipping adding default user with associated project public key for project ${
          project.name
        }`,
      );
      continue;
    }

    // Save the newly generated key
    if (!R.prop('privateKey', project)) {
      const updateQuery = prepare(
        sqlClient,
        'UPDATE project p SET private_key = :pkey WHERE id = :pid',
      );
      await query(
        sqlClient,
        updateQuery({
          pkey: keyPair.private,
          pid: project.id,
        }),
      );
    }

    // Find or create a user that has the public key linked to them
    const userRows = await query(
      sqlClient,
      selectUserIdsBySshKeyFingerprint(getSshKeyFingerprint(keyPair.public)),
    );
    const userId = R.path([0, 'usid'], userRows);

    let user;
    if (!userId) {
      try {
        user = await UserModel.addUser({
          email: `default-user@${project.name}`,
          username: `default-user@${project.name}`,
          comment: `autogenerated user for project ${project.name}`,
        });

        const keyParts = keyPair.public.split(' ');

        const {
          info: { insertId },
        } = await query(
          sqlClient,
          insertSshKey({
            id: null,
            name: 'auto-add via migration',
            keyValue: keyParts[1],
            keyType: keyParts[0],
            keyFingerprint: getSshKeyFingerprint(keyPair.public),
          }),
        );
        await query(
          sqlClient,
          addSshKeyToUser({ sshKeyId: insertId, userId: user.id }),
        );
      } catch (err) {
        logger.error(
          `Could not create default project user for ${project.name}: ${
            err.message
          }`,
        );
      }
    } else {
      //@ts-ignore
      user = await UserModel.loadUserById(userId);
    }

    // Add the user (with linked public key) to the default group as guest
    try {
      await GroupModel.addUserToGroup(user, keycloakGroup, 'guest');
    } catch (err) {
      logger.error(
        `Could not link user to default projet group for ${project.name}: ${
          err.message
        }`,
      );
    }
  }

  logger.info('Migration completed');

  sqlClient.destroy();
})();
