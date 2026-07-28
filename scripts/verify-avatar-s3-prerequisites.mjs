import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const VALIDATION_ERROR = "Avatar S3 prerequisite validation failed.";
const AWS_ERROR = "AWS prerequisite check failed.";

const REQUIRED_ENVIRONMENT = [
  "AWS_REGION",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_CONTAINER_NAME",
  "AVATAR_S3_BUCKET",
  "EXPECTED_AVATAR_RUNTIME_REGION",
  "EXPECTED_AVATAR_TASK_ROLE_ARN",
  "AVATAR_TASK_ROLE_NAME",
  "AVATAR_TASK_POLICY_NAME",
  "GITHUB_DEPLOY_ROLE_NAME",
  "AVATAR_ALLOWED_ORIGIN"
];

const REQUIRED_DEPLOY_READ_ACTIONS = [
  "ecs:DescribeServices",
  "ecs:DescribeTaskDefinition",
  "s3:GetBucketPublicAccessBlock",
  "s3:GetBucketCors",
  "s3:GetLifecycleConfiguration",
  "s3:GetBucketOwnershipControls",
  "s3:GetEncryptionConfiguration",
  "iam:GetRolePolicy",
  "iam:ListRolePolicies",
  "iam:ListAttachedRolePolicies",
  "iam:GetPolicy",
  "iam:GetPolicyVersion",
  "iam:SimulatePrincipalPolicy"
];

const STAR_ONLY_DEPLOY_READ_ACTIONS = new Set([
  "ecs:describetaskdefinition"
]);

const CONDITIONAL_DEPLOY_READ_ACTIONS = new Set([
  "iam:GetPolicy",
  "iam:GetPolicyVersion"
]);

const REPRESENTATIVE_OBJECT_ACTIONS = [
  "s3:AbortMultipartUpload",
  "s3:BypassGovernanceRetention",
  "s3:DeleteObject",
  "s3:DeleteObjectTagging",
  "s3:DeleteObjectVersion",
  "s3:DeleteObjectVersionTagging",
  "s3:GetObject",
  "s3:GetObjectAcl",
  "s3:GetObjectAttributes",
  "s3:GetObjectLegalHold",
  "s3:GetObjectRetention",
  "s3:GetObjectTagging",
  "s3:GetObjectTorrent",
  "s3:GetObjectVersion",
  "s3:GetObjectVersionAcl",
  "s3:GetObjectVersionAttributes",
  "s3:GetObjectVersionForReplication",
  "s3:GetObjectVersionTagging",
  "s3:GetObjectVersionTorrent",
  "s3:ObjectOwnerOverrideToBucketOwner",
  "s3:PutObject",
  "s3:PutObjectAcl",
  "s3:PutObjectLegalHold",
  "s3:PutObjectRetention",
  "s3:PutObjectTagging",
  "s3:PutObjectVersionTagging",
  "s3:ReplicateDelete",
  "s3:ReplicateObject",
  "s3:RestoreObject"
];

export class PreflightError extends Error {
  constructor(message = VALIDATION_ERROR) {
    super(message);
    this.name = "PreflightError";
  }
}

function fail() {
  throw new PreflightError();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value) {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => typeof item === "string" && item.length > 0)
  ) {
    return value;
  }

  fail();
}

function asStatements(document) {
  const decoded = decodePolicyDocument(document);
  const statement = decoded.Statement;
  const statements = Array.isArray(statement) ? statement : [statement];

  if (statements.length === 0 || !statements.every(isRecord)) {
    fail();
  }

  for (const item of statements) {
    const hasAction = Object.hasOwn(item, "Action");
    const hasNotAction = Object.hasOwn(item, "NotAction");
    const hasResource = Object.hasOwn(item, "Resource");
    const hasNotResource = Object.hasOwn(item, "NotResource");
    if (
      !["Allow", "Deny"].includes(item.Effect) ||
      hasAction === hasNotAction ||
      hasResource === hasNotResource
    ) {
      fail();
    }
    asStringArray(hasAction ? item.Action : item.NotAction);
    asStringArray(hasResource ? item.Resource : item.NotResource);
  }

  return statements;
}

function wildcardMatches(pattern, value) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = `^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`;
  return new RegExp(expression, "i").test(value);
}

function statementMatchesAction(statement, action) {
  if (!Object.hasOwn(statement, "Action")) {
    return false;
  }

  return asStringArray(statement.Action).some(pattern =>
    wildcardMatches(pattern, action)
  );
}

function isAllow(statement) {
  return statement.Effect === "Allow";
}

function statementResources(statement) {
  if (!Object.hasOwn(statement, "Resource")) {
    return [];
  }

  return asStringArray(statement.Resource);
}

function hasExactResource(statement, resource) {
  return statementResources(statement).includes(resource);
}

function isObjectActionPattern(pattern) {
  if (!pattern.toLowerCase().startsWith("s3:")) {
    return false;
  }

  if (!pattern.includes("*") && !pattern.includes("?")) {
    const actionName = pattern.slice(3);
    return (
      /object|multipartupload|governanceretention/i.test(actionName) ||
      /^replicate(delete|tags)$/i.test(actionName)
    );
  }

  return REPRESENTATIVE_OBJECT_ACTIONS.some(action =>
    wildcardMatches(pattern, action)
  );
}

function resourceCouldGrantObjectAccess(resource) {
  if (resource === "*") {
    return true;
  }

  if (!resource.toLowerCase().startsWith("arn:aws:s3:::")) {
    return false;
  }

  const suffix = resource.slice("arn:aws:s3:::".length);
  return suffix.includes("/") || suffix.includes("*") || suffix.includes("?");
}

function isWithinOriginalPrefix(resource, bucket) {
  const prefix = `arn:aws:s3:::${bucket}/original/`;
  return resource.startsWith(prefix);
}

function hasExactPrefixCondition(statement) {
  if (!isRecord(statement.Condition)) {
    return false;
  }

  const prefixValues = [];

  for (const [operator, condition] of Object.entries(statement.Condition)) {
    if (
      ![
        "StringEquals",
        "StringLike",
        "ForAnyValue:StringEquals",
        "ForAnyValue:StringLike"
      ].includes(operator) ||
      !isRecord(condition)
    ) {
      continue;
    }

    for (const [key, value] of Object.entries(condition)) {
      if (key.toLowerCase() === "s3:prefix") {
        prefixValues.push(...asStringArray(value));
      }
    }
  }

  return (
    prefixValues.length > 0 &&
    prefixValues.every(value => value === "original/*")
  );
}

function validatePolicyShape(document) {
  const decoded = decodePolicyDocument(document);
  asStatements(decoded);
  return decoded;
}

export function validateEnvironment(input) {
  if (!isRecord(input)) {
    fail();
  }

  const validated = {};

  for (const name of REQUIRED_ENVIRONMENT) {
    const value = input[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      fail();
    }
    validated[name] = value;
  }

  return validated;
}

export function validateService(response, expectedService) {
  if (
    !isRecord(response) ||
    !Array.isArray(response.services) ||
    response.services.length !== 1 ||
    !Array.isArray(response.failures) ||
    response.failures.length !== 0
  ) {
    fail();
  }

  const service = response.services[0];
  if (
    !isRecord(service) ||
    service.serviceName !== expectedService ||
    service.status !== "ACTIVE" ||
    typeof service.taskDefinition !== "string" ||
    service.taskDefinition.length === 0
  ) {
    fail();
  }

  return service.taskDefinition;
}

export function validateTaskDefinition(response, expected) {
  if (!isRecord(response) || !isRecord(response.taskDefinition)) {
    fail();
  }

  const task = response.taskDefinition;
  if (
    task.status !== "ACTIVE" ||
    task.taskDefinitionArn !== expected.taskDefinitionArn ||
    task.taskRoleArn !== expected.taskRoleArn ||
    !Array.isArray(task.containerDefinitions)
  ) {
    fail();
  }

  const containers = task.containerDefinitions.filter(
    container => isRecord(container) && container.name === expected.containerName
  );

  if (containers.length !== 1 || !Array.isArray(containers[0].environment)) {
    fail();
  }

  const environment = containers[0].environment;
  const secrets = containers[0].secrets;
  if (secrets !== undefined && !Array.isArray(secrets)) {
    fail();
  }
  const exactValue = (name, expectedValue) => {
    const matches = environment.filter(
      item => isRecord(item) && item.name === name
    );
    return matches.length === 1 && matches[0].value === expectedValue;
  };

  if (
    !exactValue("AVATAR_S3_BUCKET", expected.bucket) ||
    !exactValue("AWS_REGION", expected.runtimeRegion) ||
    environment.some(
      item => isRecord(item) && item.name === "AVATAR_S3_REGION"
    ) ||
    (Array.isArray(secrets) &&
      secrets.some(
        item => isRecord(item) && item.name === "AVATAR_S3_REGION"
      )
    )
  ) {
    fail();
  }

  return { taskRoleArn: task.taskRoleArn };
}

export function validatePublicAccessBlock(response) {
  if (
    !isRecord(response) ||
    !isRecord(response.PublicAccessBlockConfiguration)
  ) {
    fail();
  }

  const block = response.PublicAccessBlockConfiguration;
  if (
    block.BlockPublicAcls !== true ||
    block.IgnorePublicAcls !== true ||
    block.BlockPublicPolicy !== true ||
    block.RestrictPublicBuckets !== true
  ) {
    fail();
  }
}

export function validateOwnershipControls(response) {
  const rules = response?.OwnershipControls?.Rules;
  if (
    !Array.isArray(rules) ||
    rules.length !== 1 ||
    !isRecord(rules[0]) ||
    rules[0].ObjectOwnership !== "BucketOwnerEnforced"
  ) {
    fail();
  }
}

export function validateEncryption(response) {
  const rules = response?.ServerSideEncryptionConfiguration?.Rules;
  if (
    !Array.isArray(rules) ||
    rules.length !== 1 ||
    !isRecord(rules[0]) ||
    !isRecord(rules[0].ApplyServerSideEncryptionByDefault) ||
    rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm !== "AES256"
  ) {
    fail();
  }
}

export function validateCors(response, allowedOrigin) {
  if (
    !Array.isArray(response?.CORSRules) ||
    !response.CORSRules.every(
      rule =>
        isRecord(rule) &&
        Array.isArray(rule.AllowedOrigins) &&
        rule.AllowedOrigins.every(origin => typeof origin === "string") &&
        Array.isArray(rule.AllowedMethods) &&
        rule.AllowedMethods.every(method => typeof method === "string")
    )
  ) {
    fail();
  }

  const postRules = response.CORSRules.filter(rule =>
    rule.AllowedMethods.includes("POST")
  );
  const exactPostRules =
    postRules.length > 0 &&
    postRules.every(
      rule =>
        rule.AllowedOrigins.length === 1 &&
        rule.AllowedOrigins[0] === allowedOrigin
    );

  if (!exactPostRules) {
    fail();
  }
}

function lifecyclePrefix(rule) {
  if (typeof rule.Prefix === "string") {
    return rule.Prefix;
  }

  if (isRecord(rule.Filter) && typeof rule.Filter.Prefix === "string") {
    return rule.Filter.Prefix;
  }

  return null;
}

export function validateLifecycle(response) {
  if (
    !Array.isArray(response?.Rules) ||
    !response.Rules.every(isRecord)
  ) {
    fail();
  }

  let validRule = false;

  for (const rule of response.Rules) {
    if (!["Enabled", "Disabled"].includes(rule.Status)) {
      fail();
    }

    if (rule.Status !== "Enabled" || !isRecord(rule.Expiration)) {
      continue;
    }

    const prefix = lifecyclePrefix(rule);
    if (prefix === "original/pending/") {
      if (rule.Expiration.Days !== 1) {
        fail();
      }
      validRule = true;
      continue;
    }

    if (prefix === null || "original/pending/".startsWith(prefix)) {
      fail();
    }
  }

  if (validRule !== true) {
    fail();
  }
}

export function decodePolicyDocument(document) {
  if (isRecord(document)) {
    return document;
  }

  if (typeof document !== "string" || document.length === 0) {
    fail();
  }

  for (const candidate of [
    document,
    (() => {
      try {
        return decodeURIComponent(document.replaceAll("+", "%20"));
      } catch {
        return "";
      }
    })()
  ]) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next supported IAM document representation.
    }
  }

  fail();
}

export function parseAwsJson(output) {
  try {
    const parsed = JSON.parse(output);
    if (isRecord(parsed)) {
      return parsed;
    }
  } catch {
    // The caller receives one fixed error with no CLI output.
  }

  throw new PreflightError(AWS_ERROR);
}

export function validateNoBroadS3ObjectGrants(documents, bucket) {
  if (!Array.isArray(documents)) {
    fail();
  }

  for (const document of documents) {
    for (const statement of asStatements(document)) {
      if (
        Object.hasOwn(statement, "NotAction") ||
        Object.hasOwn(statement, "NotResource")
      ) {
        fail();
      }

      if (!isAllow(statement)) {
        continue;
      }

      const grantsObjectAccess = asStringArray(statement.Action).some(
        isObjectActionPattern
      );

      if (!grantsObjectAccess) {
        continue;
      }

      for (const resource of statementResources(statement)) {
        if (
          resourceCouldGrantObjectAccess(resource) &&
          !isWithinOriginalPrefix(resource, bucket)
        ) {
          fail();
        }
      }
    }
  }
}

function hasOnlyExactResource(statement, resource) {
  const resources = statementResources(statement);
  return resources.length > 0 && resources.every(item => item === resource);
}

export function validateTaskRolePolicyBoundaries(documents, bucket) {
  validateNoBroadS3ObjectGrants(documents, bucket);
  const bucketArn = `arn:aws:s3:::${bucket}`;

  for (const document of documents) {
    for (const statement of asStatements(document)) {
      if (!isAllow(statement)) {
        continue;
      }

      const actions = asStringArray(statement.Action);
      for (const action of actions) {
        if (
          isObjectActionPattern(action) &&
          !["s3:putobject", "s3:getobject"].includes(action.toLowerCase())
        ) {
          fail();
        }
      }

      for (const action of actions) {
        if (wildcardMatches(action, "s3:ListBucket")) {
          if (
            action.toLowerCase() !== "s3:listbucket" ||
            !hasOnlyExactResource(statement, bucketArn) ||
            !hasExactPrefixCondition(statement)
          ) {
            fail();
          }
        }
      }
    }
  }
}

export function validateTaskRolePolicy(document, bucket) {
  const decoded = validatePolicyShape(document);
  const statements = asStatements(decoded);
  const exactObjectArn = `arn:aws:s3:::${bucket}/original/*`;
  const exactBucketArn = `arn:aws:s3:::${bucket}`;

  for (const action of ["s3:PutObject", "s3:GetObject"]) {
    const allowed = statements.some(
      statement =>
        isAllow(statement) &&
        statementMatchesAction(statement, action) &&
        hasExactResource(statement, exactObjectArn)
    );
    if (!allowed) {
      fail();
    }
  }

  const strictListAllow = statements.some(
    statement =>
      isAllow(statement) &&
      statementMatchesAction(statement, "s3:ListBucket") &&
      hasExactResource(statement, exactBucketArn) &&
      hasExactPrefixCondition(statement)
  );

  if (!strictListAllow) {
    fail();
  }

  for (const statement of statements) {
    if (
      isAllow(statement) &&
      statementMatchesAction(statement, "s3:ListBucket") &&
      (!hasExactResource(statement, exactBucketArn) ||
        !hasExactPrefixCondition(statement))
    ) {
      fail();
    }
  }

  validateTaskRolePolicyBoundaries([decoded], bucket);
}

function statementProvidesDeployRead(statement, action, allowedResources) {
  if (!isAllow(statement) || !Object.hasOwn(statement, "Action")) {
    return false;
  }

  const normalizedAction = action.toLowerCase();
  const starOnly = STAR_ONLY_DEPLOY_READ_ACTIONS.has(normalizedAction);
  const actions = asStringArray(statement.Action).map(item =>
    item.toLowerCase()
  );
  const actionsAreDedicated = actions.every(item =>
    starOnly
      ? STAR_ONLY_DEPLOY_READ_ACTIONS.has(item)
      : REQUIRED_DEPLOY_READ_ACTIONS.some(
          required => required.toLowerCase() === item
        ) && !STAR_ONLY_DEPLOY_READ_ACTIONS.has(item)
  );
  if (!actions.includes(normalizedAction) || !actionsAreDedicated) {
    return false;
  }

  const resources = statementResources(statement);
  if (starOnly) {
    return (
      allowedResources.length === 1 &&
      allowedResources[0] === "*" &&
      resources.length === 1 &&
      resources[0] === "*"
    );
  }

  return (
    !allowedResources.includes("*") &&
    resources.length > 0 &&
    resources.every(resource => allowedResources.includes(resource))
  );
}

export function validateDeployRoleReadPolicies(
  documents,
  requiredResources = {}
) {
  if (!Array.isArray(documents) || documents.length === 0) {
    fail();
  }

  const statements = documents.flatMap(document => asStatements(document));
  if (
    statements.some(
      statement =>
        statement.Effect === "Deny" &&
        (Object.hasOwn(statement, "NotAction") ||
          Object.hasOwn(statement, "NotResource"))
    )
  ) {
    fail();
  }

  for (const requiredAction of REQUIRED_DEPLOY_READ_ACTIONS) {
    const actionResources = requiredResources[requiredAction];
    if (
      actionResources === undefined &&
      CONDITIONAL_DEPLOY_READ_ACTIONS.has(requiredAction)
    ) {
      continue;
    }
    if (
      !Array.isArray(actionResources) ||
      actionResources.length === 0 ||
      !actionResources.every(
        resource => typeof resource === "string" && resource.length > 0
      )
    ) {
      fail();
    }

    const denied = statements.some(
      statement =>
        statement.Effect === "Deny" &&
        statementMatchesAction(statement, requiredAction)
    );
    const allowed = actionResources.every(expectedResource =>
      statements.some(
        statement =>
          statementProvidesDeployRead(
            statement,
            requiredAction,
            actionResources
          ) &&
          statementResources(statement).includes(expectedResource)
      )
    );

    if (denied || !allowed) {
      fail();
    }
  }
}

function isCompleteListing(response) {
  return (
    isRecord(response) &&
    (!Object.hasOwn(response, "IsTruncated") ||
      response.IsTruncated === false) &&
    !Object.hasOwn(response, "Marker") &&
    !Object.hasOwn(response, "NextToken")
  );
}

export function validateRolePolicyListings(inline, attached) {
  if (
    !isCompleteListing(inline) ||
    !Array.isArray(inline.PolicyNames) ||
    !inline.PolicyNames.every(
      name => typeof name === "string" && name.length > 0
    ) ||
    new Set(inline.PolicyNames).size !== inline.PolicyNames.length ||
    !isCompleteListing(attached) ||
    !Array.isArray(attached.AttachedPolicies) ||
    !attached.AttachedPolicies.every(
      item =>
        isRecord(item) &&
        typeof item.PolicyName === "string" &&
        item.PolicyName.length > 0 &&
        typeof item.PolicyArn === "string" &&
        item.PolicyArn.length > 0
    )
  ) {
    fail();
  }

  const attachedNames = attached.AttachedPolicies.map(item => item.PolicyName);
  const attachedArns = attached.AttachedPolicies.map(item => item.PolicyArn);
  if (
    new Set(attachedNames).size !== attachedNames.length ||
    new Set(attachedArns).size !== attachedArns.length
  ) {
    fail();
  }

  return {
    inlineNames: inline.PolicyNames,
    attachedPolicies: attached.AttachedPolicies
  };
}

function validateDecisions(
  response,
  expectedActions,
  expectedDecision,
  expectedResource
) {
  if (!isRecord(response) || !Array.isArray(response.EvaluationResults)) {
    fail();
  }

  if (response.EvaluationResults.length !== expectedActions.length) {
    fail();
  }

  for (const action of expectedActions) {
    const matches = response.EvaluationResults.filter(
      result => isRecord(result) && result.EvalActionName === action
    );
    if (
      matches.length !== 1 ||
      matches[0].EvalResourceName !== expectedResource ||
      (expectedDecision === "allowed"
        ? matches[0].EvalDecision !== "allowed"
        : !["implicitDeny", "explicitDeny"].includes(
            matches[0].EvalDecision
          ))
    ) {
      fail();
    }
  }
}

export function validateSimulation(simulation, bucket) {
  if (
    !isRecord(simulation) ||
    typeof bucket !== "string" ||
    bucket.length === 0
  ) {
    fail();
  }

  const bucketArn = `arn:aws:s3:::${bucket}`;
  validateDecisions(
    simulation.objectInside,
    ["s3:PutObject", "s3:GetObject"],
    "allowed",
    `${bucketArn}/original/preflight-check`
  );
  validateDecisions(
    simulation.listOriginal,
    ["s3:ListBucket"],
    "allowed",
    bucketArn
  );
  validateDecisions(
    simulation.objectOutside,
    ["s3:PutObject", "s3:GetObject"],
    "denied",
    `${bucketArn}/outside/preflight-check`
  );
  validateDecisions(
    simulation.listOutside,
    ["s3:ListBucket"],
    "denied",
    bucketArn
  );
}

async function checkedAws(aws, args) {
  try {
    const response = await aws([...args, "--output", "json"]);
    if (!isRecord(response)) {
      throw new Error();
    }
    return response;
  } catch {
    throw new PreflightError(AWS_ERROR);
  }
}

async function loadInlinePolicy(aws, roleName, policyName) {
  const response = await checkedAws(aws, [
    "iam",
    "get-role-policy",
    "--role-name",
    roleName,
    "--policy-name",
    policyName
  ]);
  if (
    response.RoleName !== roleName ||
    response.PolicyName !== policyName
  ) {
    fail();
  }
  return validatePolicyShape(response.PolicyDocument);
}

async function loadAttachedPolicy(aws, policyArn) {
  const policy = await checkedAws(aws, [
    "iam",
    "get-policy",
    "--policy-arn",
    policyArn
  ]);
  const versionId = policy?.Policy?.DefaultVersionId;
  if (
    policy?.Policy?.Arn !== policyArn ||
    typeof versionId !== "string" ||
    versionId.length === 0
  ) {
    fail();
  }

  const version = await checkedAws(aws, [
    "iam",
    "get-policy-version",
    "--policy-arn",
    policyArn,
    "--version-id",
    versionId
  ]);
  if (
    version?.PolicyVersion?.VersionId !== versionId ||
    version?.PolicyVersion?.IsDefaultVersion !== true
  ) {
    fail();
  }
  return validatePolicyShape(version?.PolicyVersion?.Document);
}

async function loadRolePolicies(aws, roleName) {
  const inline = await checkedAws(aws, [
    "iam",
    "list-role-policies",
    "--role-name",
    roleName
  ]);
  const attached = await checkedAws(aws, [
    "iam",
    "list-attached-role-policies",
    "--role-name",
    roleName
  ]);
  const listings = validateRolePolicyListings(inline, attached);

  const inlineDocuments = [];
  for (const policyName of listings.inlineNames) {
    inlineDocuments.push(await loadInlinePolicy(aws, roleName, policyName));
  }

  const attachedDocuments = [];
  for (const item of listings.attachedPolicies) {
    attachedDocuments.push(await loadAttachedPolicy(aws, item.PolicyArn));
  }

  return {
    inlineNames: listings.inlineNames,
    attachedArns: listings.attachedPolicies.map(item => item.PolicyArn),
    documents: [...inlineDocuments, ...attachedDocuments]
  };
}

export async function runPreflight({ env: inputEnv, aws, log = console.log }) {
  const config = validateEnvironment(inputEnv);
  if (typeof aws !== "function" || typeof log !== "function") {
    fail();
  }

  const service = await checkedAws(aws, [
    "ecs",
    "describe-services",
    "--cluster",
    config.ECS_CLUSTER,
    "--services",
    config.ECS_SERVICE
  ]);
  const taskDefinition = validateService(service, config.ECS_SERVICE);

  const task = await checkedAws(aws, [
    "ecs",
    "describe-task-definition",
    "--task-definition",
    taskDefinition
  ]);
  validateTaskDefinition(task, {
    containerName: config.ECS_CONTAINER_NAME,
    bucket: config.AVATAR_S3_BUCKET,
    runtimeRegion: config.EXPECTED_AVATAR_RUNTIME_REGION,
    taskRoleArn: config.EXPECTED_AVATAR_TASK_ROLE_ARN,
    taskDefinitionArn: taskDefinition
  });
  log("PASS ECS runtime");

  const publicAccess = await checkedAws(aws, [
    "s3api",
    "get-public-access-block",
    "--bucket",
    config.AVATAR_S3_BUCKET
  ]);
  validatePublicAccessBlock(publicAccess);

  const ownership = await checkedAws(aws, [
    "s3api",
    "get-bucket-ownership-controls",
    "--bucket",
    config.AVATAR_S3_BUCKET
  ]);
  validateOwnershipControls(ownership);

  const encryption = await checkedAws(aws, [
    "s3api",
    "get-bucket-encryption",
    "--bucket",
    config.AVATAR_S3_BUCKET
  ]);
  validateEncryption(encryption);

  const cors = await checkedAws(aws, [
    "s3api",
    "get-bucket-cors",
    "--bucket",
    config.AVATAR_S3_BUCKET
  ]);
  validateCors(cors, config.AVATAR_ALLOWED_ORIGIN);

  const lifecycle = await checkedAws(aws, [
    "s3api",
    "get-bucket-lifecycle-configuration",
    "--bucket",
    config.AVATAR_S3_BUCKET
  ]);
  validateLifecycle(lifecycle);
  log("PASS S3 bucket controls");

  const namedPolicy = await loadInlinePolicy(
    aws,
    config.AVATAR_TASK_ROLE_NAME,
    config.AVATAR_TASK_POLICY_NAME
  );
  validateTaskRolePolicy(namedPolicy, config.AVATAR_S3_BUCKET);

  const taskPolicies = await loadRolePolicies(
    aws,
    config.AVATAR_TASK_ROLE_NAME
  );
  if (
    taskPolicies.inlineNames.filter(
      name => name === config.AVATAR_TASK_POLICY_NAME
    ).length !== 1
  ) {
    fail();
  }
  validateTaskRolePolicyBoundaries(
    taskPolicies.documents,
    config.AVATAR_S3_BUCKET
  );
  log("PASS task role scope");

  const objectInside = await checkedAws(aws, [
    "iam",
    "simulate-principal-policy",
    "--policy-source-arn",
    config.EXPECTED_AVATAR_TASK_ROLE_ARN,
    "--action-names",
    "s3:PutObject",
    "s3:GetObject",
    "--resource-arns",
    `arn:aws:s3:::${config.AVATAR_S3_BUCKET}/original/preflight-check`
  ]);
  const listOriginal = await checkedAws(aws, [
    "iam",
    "simulate-principal-policy",
    "--policy-source-arn",
    config.EXPECTED_AVATAR_TASK_ROLE_ARN,
    "--action-names",
    "s3:ListBucket",
    "--resource-arns",
    `arn:aws:s3:::${config.AVATAR_S3_BUCKET}`,
    "--context-entries",
    "ContextKeyName=s3:prefix,ContextKeyValues=original/preflight-check,ContextKeyType=string"
  ]);
  const objectOutside = await checkedAws(aws, [
    "iam",
    "simulate-principal-policy",
    "--policy-source-arn",
    config.EXPECTED_AVATAR_TASK_ROLE_ARN,
    "--action-names",
    "s3:PutObject",
    "s3:GetObject",
    "--resource-arns",
    `arn:aws:s3:::${config.AVATAR_S3_BUCKET}/outside/preflight-check`
  ]);
  const listOutside = await checkedAws(aws, [
    "iam",
    "simulate-principal-policy",
    "--policy-source-arn",
    config.EXPECTED_AVATAR_TASK_ROLE_ARN,
    "--action-names",
    "s3:ListBucket",
    "--resource-arns",
    `arn:aws:s3:::${config.AVATAR_S3_BUCKET}`,
    "--context-entries",
    "ContextKeyName=s3:prefix,ContextKeyValues=outside/preflight-check,ContextKeyType=string"
  ]);
  validateSimulation(
    { objectInside, listOriginal, objectOutside, listOutside },
    config.AVATAR_S3_BUCKET
  );
  log("PASS effective permissions");

  const deployPolicies = await loadRolePolicies(
    aws,
    config.GITHUB_DEPLOY_ROLE_NAME
  );
  const taskRoleMatch =
    /^arn:aws:iam::(\d{12}):role\/(.+)$/.exec(
      config.EXPECTED_AVATAR_TASK_ROLE_ARN
    );
  if (
    !taskRoleMatch ||
    taskRoleMatch[2].split("/").at(-1) !== config.AVATAR_TASK_ROLE_NAME
  ) {
    fail();
  }

  const accountId = taskRoleMatch[1];
  const deployRoleArn =
    `arn:aws:iam::${accountId}:role/${config.GITHUB_DEPLOY_ROLE_NAME}`;
  const bucketArn = `arn:aws:s3:::${config.AVATAR_S3_BUCKET}`;
  const managedPolicyArns = [
    ...taskPolicies.attachedArns,
    ...deployPolicies.attachedArns
  ];
  validateDeployRoleReadPolicies(deployPolicies.documents, {
    "ecs:DescribeServices": [
      `arn:aws:ecs:${config.AWS_REGION}:${accountId}:service/${config.ECS_CLUSTER}/${config.ECS_SERVICE}`
    ],
    "ecs:DescribeTaskDefinition": ["*"],
    "s3:GetBucketPublicAccessBlock": [bucketArn],
    "s3:GetBucketCors": [bucketArn],
    "s3:GetLifecycleConfiguration": [bucketArn],
    "s3:GetBucketOwnershipControls": [bucketArn],
    "s3:GetEncryptionConfiguration": [bucketArn],
    "iam:GetRolePolicy": [
      config.EXPECTED_AVATAR_TASK_ROLE_ARN,
      deployRoleArn
    ],
    "iam:ListRolePolicies": [
      config.EXPECTED_AVATAR_TASK_ROLE_ARN,
      deployRoleArn
    ],
    "iam:ListAttachedRolePolicies": [
      config.EXPECTED_AVATAR_TASK_ROLE_ARN,
      deployRoleArn
    ],
    ...(managedPolicyArns.length > 0
      ? {
          "iam:GetPolicy": managedPolicyArns,
          "iam:GetPolicyVersion": managedPolicyArns
        }
      : {}),
    "iam:SimulatePrincipalPolicy": [
      config.EXPECTED_AVATAR_TASK_ROLE_ARN
    ]
  });
  log("PASS deploy role read scope");

  return {
    checks: ["ecs", "s3", "task-role", "simulation", "deploy-role"]
  };
}

export function createAwsCliExecutor(executor = execFile) {
  return args =>
    new Promise((resolvePromise, rejectPromise) => {
      executor(
        "aws",
        args,
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024
        },
        (error, stdout) => {
          if (error) {
            rejectPromise(new PreflightError(AWS_ERROR));
            return;
          }

          try {
            resolvePromise(parseAwsJson(stdout));
          } catch {
            rejectPromise(new PreflightError(AWS_ERROR));
          }
        }
      );
    });
}

export async function main() {
  try {
    await runPreflight({
      env: process.env,
      aws: createAwsCliExecutor(),
      log: message => console.log(message)
    });
  } catch {
    console.error("FAIL Avatar S3 deployment prerequisites");
    process.exitCode = 1;
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await main();
}
