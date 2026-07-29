import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const VALIDATION_ERROR = "Avatar Lambda prerequisite validation failed.";
const AWS_ERROR = "AWS prerequisite check failed.";
const BASIC_EXECUTION_POLICY =
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
const REQUIRED_ENVIRONMENT = [
  "AWS_REGION",
  "AVATAR_LAMBDA_FUNCTION",
  "AVATAR_LAMBDA_ROLE_NAME",
  "AVATAR_LAMBDA_POLICY_NAME",
  "AVATAR_S3_BUCKET",
  "AVATAR_DLQ_URL",
  "AVATAR_DLQ_ARN",
  "AVATAR_ALARM_PREFIX",
  "AVATAR_ALARM_TOPIC_ARN"
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

function record(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail();
  }
  return value;
}

function array(value) {
  if (!Array.isArray(value)) {
    fail();
  }
  return value;
}

function oneString(value) {
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

function exactStrings(value, expected) {
  const actual = [...oneString(value)].sort();
  return (
    actual.length === expected.length &&
    actual.every((item, index) => item === [...expected].sort()[index])
  );
}

function policyDocument(value) {
  let decoded = value;
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decodeURIComponent(decoded));
    } catch {
      fail();
    }
  }
  return record(decoded);
}

function statements(value) {
  const document = policyDocument(value);
  const items = Array.isArray(document.Statement)
    ? document.Statement
    : [document.Statement];
  if (items.length === 0 || items.some(item => !record(item))) {
    fail();
  }
  return items;
}

function exactStatement(statement, action, resource) {
  return (
    statement.Effect === "Allow" &&
    !Object.hasOwn(statement, "NotAction") &&
    !Object.hasOwn(statement, "NotResource") &&
    exactStrings(statement.Action, [action]) &&
    exactStrings(statement.Resource, [resource]) &&
    !Object.hasOwn(statement, "Condition")
  );
}

function validateEnvironment(input) {
  const env = record(input);
  for (const name of REQUIRED_ENVIRONMENT) {
    if (typeof env[name] !== "string" || env[name].trim() === "") {
      fail();
    }
  }
  return env;
}

function validateFunction(snapshot, env, expected) {
  const config = record(snapshot.functionConfiguration);
  if (
    config.FunctionName !== env.AVATAR_LAMBDA_FUNCTION ||
    config.FunctionArn !== expected.functionArn ||
    config.Runtime !== "nodejs24.x" ||
    !exactStrings(config.Architectures, ["x86_64"]) ||
    config.MemorySize !== 1024 ||
    config.Timeout !== 30 ||
    config.Handler !== "index.handler" ||
    config.Role !== expected.roleArn ||
    record(record(config.Environment).Variables).AVATAR_S3_BUCKET !==
      env.AVATAR_S3_BUCKET
  ) {
    fail();
  }

  const invocation = record(snapshot.invokeConfiguration);
  if (
    invocation.MaximumRetryAttempts !== 2 ||
    invocation.MaximumEventAgeInSeconds !== 21600 ||
    record(record(invocation.DestinationConfig).OnFailure).Destination !==
      env.AVATAR_DLQ_ARN
  ) {
    fail();
  }

  const policy = statements(record(snapshot.functionPolicy).Policy);
  if (policy.length !== 1) {
    fail();
  }
  const permission = policy[0];
  const condition = record(permission.Condition);
  if (
    permission.Effect !== "Allow" ||
    record(permission.Principal).Service !== "s3.amazonaws.com" ||
    !exactStrings(permission.Action, ["lambda:InvokeFunction"]) ||
    !exactStrings(permission.Resource, [expected.functionArn]) ||
    record(condition.ArnLike)["AWS:SourceArn"] !== expected.bucketArn ||
    record(condition.StringEquals)["AWS:SourceAccount"] !== expected.account
  ) {
    fail();
  }
}

function validateRole(snapshot, env, expected) {
  const expectedAccess = [
    [
      "s3:GetObject",
      `${expected.bucketArn}/original/confirmed/*`
    ],
    [
      "s3:PutObject",
      `${expected.bucketArn}/processed/ready/*`
    ],
    ["sqs:SendMessage", env.AVATAR_DLQ_ARN]
  ];
  const access = statements(record(snapshot.rolePolicy).PolicyDocument);
  if (
    access.length !== expectedAccess.length ||
    !expectedAccess.every(([action, resource]) =>
      access.some(item => exactStatement(item, action, resource))
    )
  ) {
    fail();
  }

  const role = record(record(snapshot.role).Role);
  const trust = statements(role.AssumeRolePolicyDocument);
  if (
    role.Arn !== expected.roleArn ||
    trust.length !== 1 ||
    trust[0].Effect !== "Allow" ||
    !exactStrings(trust[0].Action, ["sts:AssumeRole"]) ||
    !exactStrings(record(trust[0].Principal).Service, [
      "lambda.amazonaws.com"
    ]) ||
    Object.hasOwn(trust[0], "Condition") ||
    Object.hasOwn(trust[0], "NotPrincipal")
  ) {
    fail();
  }

  if (
    !exactStrings(record(snapshot.inlinePolicies).PolicyNames, [
      env.AVATAR_LAMBDA_POLICY_NAME
    ])
  ) {
    fail();
  }

  const attached = array(
    record(snapshot.attachedPolicies).AttachedPolicies
  );
  if (
    attached.length !== 1 ||
    attached[0]?.PolicyName !== "AWSLambdaBasicExecutionRole" ||
    attached[0]?.PolicyArn !== BASIC_EXECUTION_POLICY
  ) {
    fail();
  }
}

function validateBucket(snapshot, env, expected) {
  const encryption = array(
    record(snapshot.encryption).ServerSideEncryptionConfiguration
  );
  if (
    encryption.length !== 1 ||
    record(encryption[0]).ApplyServerSideEncryptionByDefault
      ?.SSEAlgorithm !== "AES256"
  ) {
    fail();
  }

  const notifications = array(
    record(snapshot.notification).LambdaFunctionConfigurations
  );
  const matching = notifications.filter(
    item => item?.LambdaFunctionArn === expected.functionArn
  );
  if (matching.length !== 1) {
    fail();
  }
  const notification = matching[0];
  const rules = array(record(record(notification.Filter).Key).FilterRules);
  if (
    !exactStrings(notification.Events, ["s3:ObjectCreated:*"]) ||
    rules.length !== 1 ||
    rules[0]?.Name !== "prefix" ||
    rules[0]?.Value !== "original/confirmed/"
  ) {
    fail();
  }
  const overlapsConfirmed = configuration => {
    const events = Array.isArray(configuration?.Events)
      ? configuration.Events
      : [];
    if (
      !events.some(
        event =>
          event === "s3:ObjectCreated:*" ||
          event.startsWith("s3:ObjectCreated:")
      )
    ) {
      return false;
    }
    const filterRules =
      configuration?.Filter?.Key?.FilterRules;
    const prefixRule = Array.isArray(filterRules)
      ? filterRules.find(rule => rule?.Name === "prefix")
      : undefined;
    const prefix =
      typeof prefixRule?.Value === "string" ? prefixRule.Value : "";
    return (
      "original/confirmed/".startsWith(prefix) ||
      prefix.startsWith("original/confirmed/")
    );
  };
  if (
    notifications.some(
      item =>
        item !== notification &&
        overlapsConfirmed(item)
    ) ||
    array(snapshot.notification.QueueConfigurations ?? []).some(
      overlapsConfirmed
    ) ||
    array(snapshot.notification.TopicConfigurations ?? []).some(
      overlapsConfirmed
    ) ||
    Object.hasOwn(snapshot.notification, "EventBridgeConfiguration")
  ) {
    fail();
  }

  const versioning = record(snapshot.versioning).Status;
  if (
    versioning !== undefined &&
    !["Enabled", "Suspended"].includes(versioning)
  ) {
    fail();
  }
  const allRules = array(record(snapshot.lifecycle).Rules);
  const enabledRules = allRules.filter(rule => rule?.Status === "Enabled");
  const rulesForPrefix = enabledRules.filter(rule => {
    const prefix = rule?.Filter?.Prefix ?? rule?.Prefix;
    return rule?.Status === "Enabled" && prefix === "original/confirmed/";
  });
  for (const rule of enabledRules) {
    const prefix = rule?.Filter?.Prefix ?? rule?.Prefix;
    const mutatesObjects =
      Object.hasOwn(rule, "Expiration") ||
      Object.hasOwn(rule, "NoncurrentVersionExpiration") ||
      Object.hasOwn(rule, "Transitions") ||
      Object.hasOwn(rule, "NoncurrentVersionTransitions") ||
      Object.hasOwn(rule, "AbortIncompleteMultipartUpload");
    if (typeof prefix !== "string" && mutatesObjects) {
      fail();
    }
    const overlapsConfirmed =
      "original/confirmed/".startsWith(prefix) ||
      prefix?.startsWith("original/confirmed/");
    const overlapsReady =
      "processed/ready/".startsWith(prefix) ||
      prefix?.startsWith("processed/ready/");
    if (
      mutatesObjects &&
      (overlapsReady ||
        (overlapsConfirmed && prefix !== "original/confirmed/"))
    ) {
      fail();
    }
    if (mutatesObjects && prefix === "original/confirmed/") {
      if (
        Object.hasOwn(rule, "Transitions") ||
        Object.hasOwn(rule, "NoncurrentVersionTransitions") ||
        Object.hasOwn(rule, "AbortIncompleteMultipartUpload")
      ) {
        fail();
      }
      if (Object.hasOwn(rule, "Expiration")) {
        const expiration = record(rule.Expiration);
        const validCurrentExpiration =
          expiration.Days === 30 &&
          !Object.hasOwn(expiration, "ExpiredObjectDeleteMarker");
        const validDeleteMarker =
          expiration.ExpiredObjectDeleteMarker === true &&
          !Object.hasOwn(expiration, "Days");
        if (!validCurrentExpiration && !validDeleteMarker) {
          fail();
        }
      }
      if (
        Object.hasOwn(rule, "NoncurrentVersionExpiration") &&
        record(rule.NoncurrentVersionExpiration).NoncurrentDays !== 30
      ) {
        fail();
      }
    }
  }
  const current = rulesForPrefix.some(rule => rule?.Expiration?.Days === 30);
  const noncurrent = rulesForPrefix.some(
    rule => rule?.NoncurrentVersionExpiration?.NoncurrentDays === 30
  );
  const deleteMarkers = rulesForPrefix.some(
    rule => rule?.Expiration?.ExpiredObjectDeleteMarker === true
  );
  if (
    !current ||
    (versioning !== undefined && (!noncurrent || !deleteMarkers))
  ) {
    fail();
  }
}

function validateQueue(snapshot, env, expected) {
  const attributes = record(record(snapshot.queueAttributes).Attributes);
  if (
    attributes.QueueArn !== env.AVATAR_DLQ_ARN ||
    attributes.FifoQueue !== "false" ||
    attributes.SqsManagedSseEnabled !== "true" ||
    attributes.MessageRetentionPeriod !== "1209600" ||
    Object.hasOwn(attributes, "RedrivePolicy") ||
    Object.hasOwn(attributes, "RedriveAllowPolicy")
  ) {
    fail();
  }
  if (
    array(record(snapshot.eventSourceMappings).EventSourceMappings)
      .length !== 0
  ) {
    fail();
  }

  const expectedAlarms = [
    {
      metric: "ApproximateNumberOfMessagesVisible",
      namespace: "AWS/SQS",
      dimension: ["QueueName", expected.queueName]
    },
    ...[
      "Errors",
      "AsyncEventsDropped",
      "DestinationDeliveryFailures"
    ].map(metric => ({
      metric,
      namespace: "AWS/Lambda",
      dimension: ["FunctionName", env.AVATAR_LAMBDA_FUNCTION]
    }))
  ];
  const alarms = array(record(snapshot.alarms).MetricAlarms);
  for (const expectedAlarm of expectedAlarms) {
    const validAlarm = alarms.some(alarm => {
      const dimensions = Array.isArray(alarm?.Dimensions)
        ? alarm.Dimensions
        : [];
      const actions = Array.isArray(alarm?.AlarmActions)
        ? alarm.AlarmActions
        : [];
      return (
        alarm?.MetricName === expectedAlarm.metric &&
        alarm?.Namespace === expectedAlarm.namespace &&
        alarm?.Threshold === 1 &&
        alarm?.ComparisonOperator ===
          "GreaterThanOrEqualToThreshold" &&
        alarm?.Period === 300 &&
        alarm?.EvaluationPeriods === 1 &&
        alarm?.DatapointsToAlarm === 1 &&
        alarm?.TreatMissingData === "notBreaching" &&
        actions.includes(env.AVATAR_ALARM_TOPIC_ARN) &&
        dimensions.length === 1 &&
        dimensions[0]?.Name === expectedAlarm.dimension[0] &&
        dimensions[0]?.Value === expectedAlarm.dimension[1]
      );
    });
    if (!validAlarm) {
      fail();
    }
  }

  const subscriptions = array(
    record(snapshot.subscriptions).Subscriptions
  );
  if (
    !subscriptions.some(
      item =>
        item?.Protocol === "email" &&
        typeof item.Endpoint === "string" &&
        item.Endpoint.length > 0 &&
        typeof item.SubscriptionArn === "string" &&
        item.SubscriptionArn !== "PendingConfirmation"
    )
  ) {
    fail();
  }
}

export function validateAvatarLambdaSnapshot(snapshotInput, environment) {
  const snapshot = record(snapshotInput);
  const env = validateEnvironment(environment);
  const functionArn = record(snapshot.functionConfiguration).FunctionArn;
  const match =
    typeof functionArn === "string"
      ? functionArn.match(/^arn:aws:lambda:([^:]+):(\d{12}):function:(.+)$/)
      : null;
  if (
    !match ||
    match[1] !== env.AWS_REGION ||
    match[3] !== env.AVATAR_LAMBDA_FUNCTION
  ) {
    fail();
  }
  const expected = {
    account: match[2],
    functionArn,
    roleArn:
      `arn:aws:iam::${match[2]}:role/${env.AVATAR_LAMBDA_ROLE_NAME}`,
    bucketArn: `arn:aws:s3:::${env.AVATAR_S3_BUCKET}`,
    queueName: env.AVATAR_DLQ_ARN.split(":").at(-1)
  };
  validateFunction(snapshot, env, expected);
  validateRole(snapshot, env, expected);
  validateBucket(snapshot, env, expected);
  validateQueue(snapshot, env, expected);
}

export function createAwsCliExecutor(executor = execFile) {
  return args =>
    new Promise((resolvePromise, rejectPromise) => {
      executor(
        "aws",
        [...args, "--output", "json", "--no-cli-pager"],
        { maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            rejectPromise(new PreflightError(AWS_ERROR));
            return;
          }
          try {
            resolvePromise(JSON.parse(stdout));
          } catch {
            rejectPromise(new PreflightError(AWS_ERROR));
          }
        }
      );
    });
}

export async function collectAvatarLambdaSnapshot(
  environment,
  aws = createAwsCliExecutor()
) {
  const env = validateEnvironment(environment);
  const region = ["--region", env.AWS_REGION];
  const calls = [
    ["lambda", "get-function-configuration", "--function-name", env.AVATAR_LAMBDA_FUNCTION, ...region],
    ["lambda", "get-policy", "--function-name", env.AVATAR_LAMBDA_FUNCTION, ...region],
    ["lambda", "get-function-event-invoke-config", "--function-name", env.AVATAR_LAMBDA_FUNCTION, ...region],
    ["iam", "get-role-policy", "--role-name", env.AVATAR_LAMBDA_ROLE_NAME, "--policy-name", env.AVATAR_LAMBDA_POLICY_NAME],
    ["iam", "get-role", "--role-name", env.AVATAR_LAMBDA_ROLE_NAME],
    ["iam", "list-role-policies", "--role-name", env.AVATAR_LAMBDA_ROLE_NAME],
    ["iam", "list-attached-role-policies", "--role-name", env.AVATAR_LAMBDA_ROLE_NAME],
    ["s3api", "get-bucket-encryption", "--bucket", env.AVATAR_S3_BUCKET, ...region],
    ["s3api", "get-bucket-notification-configuration", "--bucket", env.AVATAR_S3_BUCKET, ...region],
    ["s3api", "get-bucket-versioning", "--bucket", env.AVATAR_S3_BUCKET, ...region],
    ["s3api", "get-bucket-lifecycle-configuration", "--bucket", env.AVATAR_S3_BUCKET, ...region],
    ["sqs", "get-queue-attributes", "--queue-url", env.AVATAR_DLQ_URL, "--attribute-names", "QueueArn", "FifoQueue", "SqsManagedSseEnabled", "MessageRetentionPeriod", "RedrivePolicy", "RedriveAllowPolicy", ...region],
    ["lambda", "list-event-source-mappings", "--event-source-arn", env.AVATAR_DLQ_ARN, ...region],
    ["cloudwatch", "describe-alarms", "--alarm-name-prefix", env.AVATAR_ALARM_PREFIX, ...region],
    ["sns", "list-subscriptions-by-topic", "--topic-arn", env.AVATAR_ALARM_TOPIC_ARN, ...region]
  ];
  const values = await Promise.all(calls.map(args => aws(args)));
  const names = [
    "functionConfiguration",
    "functionPolicy",
    "invokeConfiguration",
    "rolePolicy",
    "role",
    "inlinePolicies",
    "attachedPolicies",
    "encryption",
    "notification",
    "versioning",
    "lifecycle",
    "queueAttributes",
    "eventSourceMappings",
    "alarms",
    "subscriptions"
  ];
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

export async function runPreflight(
  environment = process.env,
  aws = createAwsCliExecutor()
) {
  const snapshot = await collectAvatarLambdaSnapshot(environment, aws);
  validateAvatarLambdaSnapshot(snapshot, environment);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPreflight()
    .then(() => {
      console.log("Avatar Lambda prerequisites verified.");
    })
    .catch(() => {
      console.error(VALIDATION_ERROR);
      process.exitCode = 1;
    });
}
