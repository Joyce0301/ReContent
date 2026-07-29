import { describe, expect, it, vi } from "vitest";

import {
  collectAvatarLambdaSnapshot,
  createAwsCliExecutor,
  PreflightError,
  validateAvatarLambdaSnapshot
} from "./verify-avatar-lambda-prerequisites.mjs";

const account = "881424867096";
const region = "us-east-1";
const bucket = "recontent-avatar-pipeline";
const functionName = "recontent-avatar-processor";
const functionArn =
  `arn:aws:lambda:${region}:${account}:function:${functionName}`;
const roleName = "recontent-avatar-processor-role";
const roleArn = `arn:aws:iam::${account}:role/${roleName}`;
const queueName = "recontent-avatar-processor-dlq";
const queueArn = `arn:aws:sqs:${region}:${account}:${queueName}`;
const topicArn =
  `arn:aws:sns:${region}:${account}:recontent-avatar-processor-alerts`;

const env = {
  AWS_REGION: region,
  AVATAR_LAMBDA_FUNCTION: functionName,
  AVATAR_LAMBDA_ROLE_NAME: roleName,
  AVATAR_LAMBDA_POLICY_NAME: "recontent-avatar-processor-access",
  AVATAR_S3_BUCKET: bucket,
  AVATAR_DLQ_URL:
    `https://sqs.${region}.amazonaws.com/${account}/${queueName}`,
  AVATAR_DLQ_ARN: queueArn,
  AVATAR_ALARM_PREFIX: "recontent-avatar-processor",
  AVATAR_ALARM_TOPIC_ARN: topicArn
};

function validSnapshot() {
  return {
    functionConfiguration: {
      FunctionName: functionName,
      FunctionArn: functionArn,
      Runtime: "nodejs24.x",
      Architectures: ["x86_64"],
      MemorySize: 1024,
      Timeout: 30,
      Handler: "index.handler",
      Role: roleArn,
      Environment: {
        Variables: { AVATAR_S3_BUCKET: bucket }
      }
    },
    functionPolicy: {
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "s3.amazonaws.com" },
            Action: "lambda:InvokeFunction",
            Resource: functionArn,
            Condition: {
              ArnLike: {
                "AWS:SourceArn": `arn:aws:s3:::${bucket}`
              },
              StringEquals: {
                "AWS:SourceAccount": account
              }
            }
          }
        ]
      })
    },
    invokeConfiguration: {
      MaximumRetryAttempts: 2,
      MaximumEventAgeInSeconds: 21600,
      DestinationConfig: {
        OnFailure: { Destination: queueArn }
      }
    },
    rolePolicy: {
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "s3:GetObject",
            Resource:
              `arn:aws:s3:::${bucket}/original/confirmed/*`
          },
          {
            Effect: "Allow",
            Action: "s3:PutObject",
            Resource:
              `arn:aws:s3:::${bucket}/processed/ready/*`
          },
          {
            Effect: "Allow",
            Action: "sqs:SendMessage",
            Resource: queueArn
          }
        ]
      }
    },
    role: {
      Role: {
        Arn: roleArn,
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "lambda.amazonaws.com" },
              Action: "sts:AssumeRole"
            }
          ]
        }
      }
    },
    inlinePolicies: {
      PolicyNames: [env.AVATAR_LAMBDA_POLICY_NAME]
    },
    attachedPolicies: {
      AttachedPolicies: [
        {
          PolicyName: "AWSLambdaBasicExecutionRole",
          PolicyArn:
            "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }
      ]
    },
    encryption: {
      ServerSideEncryptionConfiguration: [
        {
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: "AES256"
          }
        }
      ]
    },
    notification: {
      LambdaFunctionConfigurations: [
        {
          Id: "avatar-confirmed",
          LambdaFunctionArn: functionArn,
          Events: ["s3:ObjectCreated:*"],
          Filter: {
            Key: {
              FilterRules: [
                { Name: "prefix", Value: "original/confirmed/" }
              ]
            }
          }
        }
      ]
    },
    versioning: { Status: "Enabled" },
    lifecycle: {
      Rules: [
        {
          ID: "confirmed-current",
          Status: "Enabled",
          Filter: { Prefix: "original/confirmed/" },
          Expiration: { Days: 30 }
        },
        {
          ID: "confirmed-noncurrent",
          Status: "Enabled",
          Filter: { Prefix: "original/confirmed/" },
          NoncurrentVersionExpiration: { NoncurrentDays: 30 }
        },
        {
          ID: "confirmed-delete-markers",
          Status: "Enabled",
          Filter: { Prefix: "original/confirmed/" },
          Expiration: { ExpiredObjectDeleteMarker: true }
        }
      ]
    },
    queueAttributes: {
      Attributes: {
        QueueArn: queueArn,
        FifoQueue: "false",
        SqsManagedSseEnabled: "true",
        MessageRetentionPeriod: "1209600"
      }
    },
    eventSourceMappings: {
      EventSourceMappings: []
    },
    alarms: {
      MetricAlarms: [
        {
          AlarmName: "recontent-avatar-processor-dlq-visible",
          Namespace: "AWS/SQS",
          MetricName: "ApproximateNumberOfMessagesVisible",
          Dimensions: [{ Name: "QueueName", Value: queueName }],
          Threshold: 1,
          ComparisonOperator: "GreaterThanOrEqualToThreshold",
          Period: 300,
          EvaluationPeriods: 1,
          DatapointsToAlarm: 1,
          TreatMissingData: "notBreaching",
          AlarmActions: [topicArn]
        },
        ...[
          "Errors",
          "AsyncEventsDropped",
          "DestinationDeliveryFailures"
        ].map(metricName => ({
          AlarmName:
            `recontent-avatar-processor-${metricName.toLowerCase()}`,
          Namespace: "AWS/Lambda",
          MetricName: metricName,
          Dimensions: [{ Name: "FunctionName", Value: functionName }],
          Threshold: 1,
          ComparisonOperator: "GreaterThanOrEqualToThreshold",
          Period: 300,
          EvaluationPeriods: 1,
          DatapointsToAlarm: 1,
          TreatMissingData: "notBreaching",
          AlarmActions: [topicArn]
        }))
      ]
    },
    subscriptions: {
      Subscriptions: [
        {
          Protocol: "email",
          Endpoint: "operator@example.com",
          SubscriptionArn:
            `arn:aws:sns:${region}:${account}:subscription-id`
        }
      ]
    }
  };
}

function invalid(mutator: (snapshot: ReturnType<typeof validSnapshot>) => void) {
  const snapshot = structuredClone(validSnapshot());
  mutator(snapshot);
  return snapshot;
}

describe("validateAvatarLambdaSnapshot", () => {
  it("accepts the complete least-privilege avatar pipeline configuration", () => {
    expect(() =>
      validateAvatarLambdaSnapshot(validSnapshot(), env)
    ).not.toThrow();
  });

  it("accepts an unversioned bucket without noncurrent cleanup rules", () => {
    const snapshot = invalid(value => {
      value.versioning = {};
      value.lifecycle.Rules = [value.lifecycle.Rules[0]];
    });

    expect(() =>
      validateAvatarLambdaSnapshot(snapshot, env)
    ).not.toThrow();
  });

  it("uses a fully matching alarm when another alarm has the same metric", () => {
    const snapshot = invalid(value => {
      value.alarms.MetricAlarms.unshift({
        ...value.alarms.MetricAlarms[1],
        AlarmName: "unrelated-errors",
        AlarmActions: []
      });
    });

    expect(() =>
      validateAvatarLambdaSnapshot(snapshot, env)
    ).not.toThrow();
  });

  it.each([
    [
      "Lambda runtime",
      invalid(value => {
        value.functionConfiguration.Runtime = "nodejs22.x";
      })
    ],
    [
      "Lambda role",
      invalid(value => {
        value.functionConfiguration.Role =
          `arn:aws:iam::${account}:role/other-role`;
      })
    ],
    [
      "broad object access",
      invalid(value => {
        value.rolePolicy.PolicyDocument.Statement[0].Resource =
          `arn:aws:s3:::${bucket}/*`;
      })
    ],
    [
      "extra inline policy",
      invalid(value => {
        value.inlinePolicies.PolicyNames.push("unexpected-policy");
      })
    ],
    [
      "role trust principal",
      invalid(value => {
        value.role.Role.AssumeRolePolicyDocument.Statement[0]
          .Principal.Service = [
            "lambda.amazonaws.com",
            "ecs-tasks.amazonaws.com"
          ];
      })
    ],
    [
      "KMS bucket encryption",
      invalid(value => {
        value.encryption.ServerSideEncryptionConfiguration[0]
          .ApplyServerSideEncryptionByDefault.SSEAlgorithm = "aws:kms";
      })
    ],
    [
      "S3 notification prefix",
      invalid(value => {
        value.notification.LambdaFunctionConfigurations[0]
          .Filter.Key.FilterRules[0].Value = "original/";
      })
    ],
    [
      "overlapping Lambda notification",
      invalid(value => {
        value.notification.LambdaFunctionConfigurations.push({
          Id: "unexpected-consumer",
          LambdaFunctionArn:
            `arn:aws:lambda:${region}:${account}:function:other`,
          Events: ["s3:ObjectCreated:*"],
          Filter: {
            Key: {
              FilterRules: [
                { Name: "prefix", Value: "original/" }
              ]
            }
          }
        });
      })
    ],
    [
      "avatar topic notification",
      invalid(value => {
        value.notification.TopicConfigurations = [
          {
            TopicArn:
              `arn:aws:sns:${region}:${account}:unexpected`,
            Events: ["s3:ObjectCreated:*"]
          }
        ];
      })
    ],
    [
      "bucket EventBridge notification",
      invalid(value => {
        value.notification.EventBridgeConfiguration = {};
      })
    ],
    [
      "Lambda source account",
      invalid(value => {
        const policy = JSON.parse(value.functionPolicy.Policy);
        policy.Statement[0].Condition.StringEquals[
          "AWS:SourceAccount"
        ] = "000000000000";
        value.functionPolicy.Policy = JSON.stringify(policy);
      })
    ],
    [
      "async retries",
      invalid(value => {
        value.invokeConfiguration.MaximumRetryAttempts = 0;
      })
    ],
    [
      "queue encryption",
      invalid(value => {
        value.queueAttributes.Attributes.SqsManagedSseEnabled = "false";
      })
    ],
    [
      "queue redrive policy",
      invalid(value => {
        value.queueAttributes.Attributes.RedrivePolicy =
          JSON.stringify({
            deadLetterTargetArn:
              `arn:aws:sqs:${region}:${account}:other`,
            maxReceiveCount: 3
          });
      })
    ],
    [
      "DLQ event source mapping",
      invalid(value => {
        value.eventSourceMappings.EventSourceMappings = [
          {
            UUID: "mapping-id",
            EventSourceArn: queueArn,
            FunctionArn: functionArn
          }
        ];
      })
    ],
    [
      "noncurrent lifecycle",
      invalid(value => {
        value.lifecycle.Rules.splice(1, 1);
      })
    ],
    [
      "broad lifecycle expiration",
      invalid(value => {
        value.lifecycle.Rules.push({
          ID: "broad-expiration",
          Status: "Enabled",
          Filter: { Prefix: "original/" },
          Expiration: { Days: 7 }
        });
      })
    ],
    [
      "early confirmed-original expiration",
      invalid(value => {
        value.lifecycle.Rules.push({
          ID: "early-confirmed-expiration",
          Status: "Enabled",
          Filter: { Prefix: "original/confirmed/" },
          Expiration: { Days: 7 }
        });
      })
    ],
    [
      "processed avatar expiration",
      invalid(value => {
        value.lifecycle.Rules.push({
          ID: "processed-expiration",
          Status: "Enabled",
          Filter: { Prefix: "processed/ready/" },
          Expiration: { Days: 30 }
        });
      })
    ],
    [
      "Lambda alarm",
      invalid(value => {
        value.alarms.MetricAlarms =
          value.alarms.MetricAlarms.filter(
            alarm => alarm.MetricName !== "AsyncEventsDropped"
          );
      })
    ],
    [
      "confirmed email subscription",
      invalid(value => {
        value.subscriptions.Subscriptions[0].SubscriptionArn =
          "PendingConfirmation";
      })
    ]
  ])("rejects an unsafe or incomplete %s", (_name, snapshot) => {
    expect(() =>
      validateAvatarLambdaSnapshot(snapshot, env)
    ).toThrow(PreflightError);
  });
});

describe("AWS CLI collection", () => {
  it("collects every prerequisite through read-only AWS CLI commands", async () => {
    const snapshot = validSnapshot();
    const responses = [
      snapshot.functionConfiguration,
      snapshot.functionPolicy,
      snapshot.invokeConfiguration,
      snapshot.rolePolicy,
      snapshot.role,
      snapshot.inlinePolicies,
      snapshot.attachedPolicies,
      snapshot.encryption,
      snapshot.notification,
      snapshot.versioning,
      snapshot.lifecycle,
      snapshot.queueAttributes,
      snapshot.eventSourceMappings,
      snapshot.alarms,
      snapshot.subscriptions
    ];
    const aws = vi.fn().mockImplementation(async () => responses.shift());

    await expect(collectAvatarLambdaSnapshot(env, aws)).resolves.toEqual(
      snapshot
    );
    expect(aws).toHaveBeenCalledTimes(15);
    expect(aws.mock.calls.every(([args]) => args[0] !== "configure")).toBe(
      true
    );
    expect(aws).toHaveBeenCalledWith([
      "lambda",
      "get-function-configuration",
      "--function-name",
      functionName,
      "--region",
      region
    ]);
  });

  it("adds safe JSON flags and parses AWS CLI output", async () => {
    const executor = vi.fn(
      (_command, _args, _options, callback) =>
        callback(null, '{"ok":true}')
    );

    const result = await createAwsCliExecutor(executor)([
      "lambda",
      "get-policy"
    ]);

    expect(result).toEqual({ ok: true });
    expect(executor).toHaveBeenCalledWith(
      "aws",
      ["lambda", "get-policy", "--output", "json", "--no-cli-pager"],
      { maxBuffer: 1024 * 1024 },
      expect.any(Function)
    );
  });

  it("replaces raw AWS CLI errors with a stable message", async () => {
    const executor = vi.fn(
      (_command, _args, _options, callback) =>
        callback(new Error("credential detail must not escape"), "")
    );

    await expect(
      createAwsCliExecutor(executor)(["lambda", "get-policy"])
    ).rejects.toThrow("AWS prerequisite check failed.");
  });
});
