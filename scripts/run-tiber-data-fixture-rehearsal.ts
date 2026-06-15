import { runTiberDataFixtureRehearsal } from '../src/rehearsal/runTiberDataFixtureRehearsal.js';
import type { FromProjectionInputFixtureIdentityConfig } from '../src/adapters/tiberData/fromProjectionInputFixture.js';

const [, , fixturePath, outputDir] = process.argv;

// Governed identity reference config. The fixture cannot supply an identity
// artifact version on its own, so the adapter requires it from governed config
// and fails closed when it is absent. Provide it via environment:
//   TIBER_DATA_IDENTITY_VERSION       (required for a successful run)
//   TIBER_DATA_IDENTITY_ARTIFACT_ID   (optional; otherwise derived deterministically)
//   TIBER_DATA_IDENTITY_URI           (optional)
const identityVersion = process.env.TIBER_DATA_IDENTITY_VERSION;
const identityArtifactId = process.env.TIBER_DATA_IDENTITY_ARTIFACT_ID;
const identityUri = process.env.TIBER_DATA_IDENTITY_URI;

const identityRef: FromProjectionInputFixtureIdentityConfig = {
  ...(identityVersion === undefined ? {} : { version: identityVersion }),
  ...(identityArtifactId === undefined ? {} : { identity_artifact_id: identityArtifactId }),
  ...(identityUri === undefined ? {} : { uri: identityUri }),
};

if (identityVersion === undefined) {
  console.warn(
    'TIBER_DATA_IDENTITY_VERSION is not set; the rehearsal will fail closed with TIBER_DATA_FIXTURE_IDENTITY_VERSION_MISSING.',
  );
}

const result = await runTiberDataFixtureRehearsal({
  fixture_path: fixturePath,
  ...(outputDir === undefined ? {} : { output_dir: outputDir }),
  identity_ref: identityRef,
});

console.log(JSON.stringify(result.ok ? result.data : { errors: result.errors, warnings: result.warnings }, null, 2));

if (!result.ok) process.exitCode = 1;
