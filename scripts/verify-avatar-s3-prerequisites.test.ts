import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  createAwsCliExecutor,
  decodePolicyDocument,
  parseAwsJson,
  runRenderedTaskPreflight,
  runPreflight,
  validateCors,
  validateDeployRoleReadPolicies,
  validateEncryption,
  validateEnvironment,
  validateLifecycle,
  validateNoBroadS3ObjectGrants,
  validateOwnershipControls,
  validatePublicAccessBlock,
  validateRolePolicyListings,
  validateService,
  validateSimulation,
  validateTaskRolePolicyBoundaries,
  validateTaskDefinition,
  validateTaskRolePolicy,
  validateRenderedTaskDefinition
} from "./verify-avatar-s3-prerequisites.mjs";

const bucket = "recontent-avatar-pipeline-20260726";
const taskRoleArn =
  "arn:aws:iam::881424867096:role/recontent-ecs-task-role";
const objectArn = `arn:aws:s3:::${bucket}/original/*`;
const bucketArn = `arn:aws:s3:::${bucket}`;
const managedPolicyArn =
  "arn:aws:iam::881424867096:policy/recontent-task-observability";

const env = {
  AWS_REGION: "us-east-1",
  ECS_CLUSTER: "default",
  ECS_SERVICE: "recontent-b13f",
  ECS_CONTAINER_NAME: "Main",
  AVATAR_S3_BUCKET: bucket,
  EXPECTED_AVATAR_RUNTIME_REGION: "us-east-1",
  EXPECTED_AVATAR_TASK_ROLE_ARN: taskRoleArn,
  AVATAR_TASK_ROLE_NAME: "recontent-ecs-task-role",
  AVATAR_TASK_POLICY_NAME: "recontent-avatar-originals-access",
  GITHUB_DEPLOY_ROLE_NAME: "github-actions-recontent-deploy",
  AVATAR_ALLOWED_ORIGIN:
    "https://re-6718725ab2374d34942ac6eee4abd640.ecs.us-east-1.on.aws"
};

const taskDefinitionArn =
  "arn:aws:ecs:us-east-1:881424867096:task-definition/recontent:42";
const deployRoleArn =
  "arn:aws:iam::881424867096:role/github-actions-recontent-deploy";
const serviceArn =
  "arn:aws:ecs:us-east-1:881424867096:service/default/recontent-b13f";
const alternateCredentialNames = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "AWS_ROLE_ARN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE"
] as const;

function validTaskDefinition() {
  return {
    taskDefinition: {
      status: "ACTIVE",
      taskDefinitionArn,
      taskRoleArn,
      executionRoleArn:
        "arn:aws:iam::881424867096:role/recontent-ecs-execution-role",
      containerDefinitions: [
        {
          name: "Main",
          environment: [
            { name: "AVATAR_S3_BUCKET", value: bucket },
            { name: "AWS_REGION", value: "us-east-1" }
          ]
        }
      ]
    }
  };
}

function validTaskPolicy() {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:PutObject", "s3:GetObject"],
        Resource: objectArn
      },
      {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: bucketArn,
        Condition: {
          StringLike: {
            "s3:prefix": "original/*"
          }
        }
      }
    ]
  };
}

function validDeployPolicy() {
  return {
    Version: "2012-10-17",
    Statement: {
      Effect: "Allow",
      Action: [
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
      ],
      Resource: "*"
    }
  };
}

function deployReadResources() {
  return {
    "ecs:DescribeServices": [serviceArn],
    "ecs:DescribeTaskDefinition": ["*"],
    "s3:GetBucketPublicAccessBlock": [bucketArn],
    "s3:GetBucketCors": [bucketArn],
    "s3:GetLifecycleConfiguration": [bucketArn],
    "s3:GetBucketOwnershipControls": [bucketArn],
    "s3:GetEncryptionConfiguration": [bucketArn],
    "iam:GetRolePolicy": [taskRoleArn, deployRoleArn],
    "iam:ListRolePolicies": [taskRoleArn, deployRoleArn],
    "iam:ListAttachedRolePolicies": [taskRoleArn, deployRoleArn],
    "iam:GetPolicy": [managedPolicyArn],
    "iam:GetPolicyVersion": [managedPolicyArn],
    "iam:SimulatePrincipalPolicy": [taskRoleArn]
  };
}

function scopedDeployPolicy() {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "ecs:DescribeServices",
        Resource: serviceArn
      },
      {
        Effect: "Allow",
        Action: "ecs:DescribeTaskDefinition",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: [
          "s3:GetBucketPublicAccessBlock",
          "s3:GetBucketCors",
          "s3:GetLifecycleConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:GetEncryptionConfiguration"
        ],
        Resource: bucketArn
      },
      {
        Effect: "Allow",
        Action: [
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies"
        ],
        Resource: [taskRoleArn, deployRoleArn]
      },
      {
        Effect: "Allow",
        Action: ["iam:GetPolicy", "iam:GetPolicyVersion"],
        Resource: managedPolicyArn
      },
      {
        Effect: "Allow",
        Action: "iam:SimulatePrincipalPolicy",
        Resource: taskRoleArn
      }
    ]
  };
}

function validSimulation() {
  return {
    objectInside: {
      EvaluationResults: [
        {
          EvalActionName: "s3:PutObject",
          EvalResourceName: `${bucketArn}/original/preflight-check`,
          EvalDecision: "allowed"
        },
        {
          EvalActionName: "s3:GetObject",
          EvalResourceName: `${bucketArn}/original/preflight-check`,
          EvalDecision: "allowed"
        }
      ]
    },
    listOriginal: {
      EvaluationResults: [
        {
          EvalActionName: "s3:ListBucket",
          EvalResourceName: bucketArn,
          EvalDecision: "allowed"
        }
      ]
    },
    objectOutside: {
      EvaluationResults: [
        {
          EvalActionName: "s3:PutObject",
          EvalResourceName: `${bucketArn}/outside/preflight-check`,
          EvalDecision: "explicitDeny"
        },
        {
          EvalActionName: "s3:GetObject",
          EvalResourceName: `${bucketArn}/outside/preflight-check`,
          EvalDecision: "implicitDeny"
        }
      ]
    },
    listOutside: {
      EvaluationResults: [
        {
          EvalActionName: "s3:ListBucket",
          EvalResourceName: bucketArn,
          EvalDecision: "implicitDeny"
        }
      ]
    }
  };
}

function expectInvalid(operation: () => unknown) {
  expect(operation).toThrow(/prerequisite/i);
}

describe("environment contract", () => {
  it("accepts the standard AWS region contract without AVATAR_S3_REGION", () => {
    expect(validateEnvironment(env)).toEqual(env);
  });

  it.each(Object.keys(env))("fails closed when %s is missing", key => {
    const candidate = { ...env, [key]: "" };

    expectInvalid(() => validateEnvironment(candidate));
  });

  it("does not use AVATAR_S3_REGION as the expected runtime region", () => {
    const candidate = {
      ...env,
      EXPECTED_AVATAR_RUNTIME_REGION: "",
      AVATAR_S3_REGION: "us-east-1"
    };

    expectInvalid(() => validateEnvironment(candidate));
  });
});

describe("ECS task definition", () => {
  it("resolves exactly one active service task definition", () => {
    expect(
      validateService(
        {
          services: [
            {
              serviceName: env.ECS_SERVICE,
              status: "ACTIVE",
              taskDefinition: taskDefinitionArn
            }
          ],
          failures: []
        },
        env.ECS_SERVICE
      )
    ).toBe(taskDefinitionArn);
  });

  it.each([
    { services: [], failures: [] },
    {
      services: [
        {
          serviceName: env.ECS_SERVICE,
          status: "ACTIVE",
          taskDefinition: taskDefinitionArn
        },
        {
          serviceName: env.ECS_SERVICE,
          status: "ACTIVE",
          taskDefinition: taskDefinitionArn
        }
      ],
      failures: []
    },
    {
      services: [
        {
          serviceName: env.ECS_SERVICE,
          status: "DRAINING",
          taskDefinition: taskDefinitionArn
        }
      ],
      failures: []
    },
    {
      services: [
        {
          serviceName: env.ECS_SERVICE,
          status: "ACTIVE",
          taskDefinition: taskDefinitionArn
        }
      ],
      failures: [{ arn: "redacted", reason: "MISSING" }]
    }
  ])("rejects missing, duplicate, inactive, or failed services", response => {
    expectInvalid(() => validateService(response, env.ECS_SERVICE));
  });

  it("requires the exact active task role and exact named container settings", () => {
    expect(
      validateTaskDefinition(validTaskDefinition(), {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    ).toEqual({ taskRoleArn });
  });

  it("does not accept executionRoleArn in place of taskRoleArn", () => {
    const response = validTaskDefinition();
    delete (response.taskDefinition as { taskRoleArn?: string }).taskRoleArn;
    response.taskDefinition.executionRoleArn = taskRoleArn;

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it.each([
    ["wrong role", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.taskRoleArn =
        "arn:aws:iam::881424867096:role/another-role";
    }],
    ["inactive task", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.status = "INACTIVE";
    }],
    ["mismatched task ARN", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.taskDefinitionArn =
        "arn:aws:ecs:us-east-1:881424867096:task-definition/other:1";
    }],
    ["missing bucket", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment =
        value.taskDefinition.containerDefinitions[0].environment.filter(
          item => item.name !== "AVATAR_S3_BUCKET"
        );
    }],
    ["wrong bucket", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment[0].value =
        "wrong-bucket";
    }],
    ["missing AWS_REGION", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment =
        value.taskDefinition.containerDefinitions[0].environment.filter(
          item => item.name !== "AWS_REGION"
        );
    }],
    ["wrong AWS_REGION", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment[1].value =
        "us-west-2";
    }],
    ["duplicate container", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions.push({
        ...value.taskDefinition.containerDefinitions[0]
      });
    }],
    ["legacy AVATAR_S3_REGION", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment.push({
        name: "AVATAR_S3_REGION",
        value: "us-east-1"
      });
    }],
    ["duplicate legacy AVATAR_S3_REGION", (value: ReturnType<typeof validTaskDefinition>) => {
      value.taskDefinition.containerDefinitions[0].environment.push(
        { name: "AVATAR_S3_REGION", value: "us-east-1" },
        { name: "AVATAR_S3_REGION", value: "us-west-2" }
      );
    }],
    ["legacy AVATAR_S3_REGION secret", (value: ReturnType<typeof validTaskDefinition>) => {
      Object.assign(value.taskDefinition.containerDefinitions[0], {
        secrets: [
          {
            name: "AVATAR_S3_REGION",
            valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/legacy"
          }
        ]
      });
    }],
    ["duplicate legacy AVATAR_S3_REGION secrets", (value: ReturnType<typeof validTaskDefinition>) => {
      Object.assign(value.taskDefinition.containerDefinitions[0], {
        secrets: [
          {
            name: "AVATAR_S3_REGION",
            valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/legacy-a"
          },
          {
            name: "AVATAR_S3_REGION",
            valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/legacy-b"
          }
        ]
      });
    }]
  ] as const)("rejects %s", (_name, mutate) => {
    const response = validTaskDefinition();
    mutate(response);

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it.each(alternateCredentialNames)(
    "rejects alternate credential environment variable %s",
    name => {
      const response = validTaskDefinition();
      response.taskDefinition.containerDefinitions[0].environment.push({
        name,
        value: "must-not-override-task-role"
      });

      expectInvalid(() =>
        validateTaskDefinition(response, {
          containerName: "Main",
          bucket,
          runtimeRegion: "us-east-1",
          taskRoleArn,
          taskDefinitionArn
        })
      );
    }
  );

  it.each(alternateCredentialNames)(
    "rejects alternate credential secret %s",
    name => {
      const response = validTaskDefinition();
      Object.assign(response.taskDefinition.containerDefinitions[0], {
        secrets: [
          {
            name,
            valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/blocked"
          }
        ]
      });

      expectInvalid(() =>
        validateTaskDefinition(response, {
          containerName: "Main",
          bucket,
          runtimeRegion: "us-east-1",
          taskRoleArn,
          taskDefinitionArn
        })
      );
    }
  );

  it("rejects case-variant and mixed environment/secret credential overrides", () => {
    const response = validTaskDefinition();
    response.taskDefinition.containerDefinitions[0].environment.push({
      name: "aws_access_key_id",
      value: "blocked"
    });
    Object.assign(response.taskDefinition.containerDefinitions[0], {
      secrets: [
        {
          name: "AWS_ACCESS_KEY_ID",
          valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/blocked"
        }
      ]
    });

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it.each([
    "AWS_REGION",
    "aws_region",
    "AVATAR_S3_BUCKET",
    "avatar_s3_bucket"
  ])("rejects required runtime setting secret override %s", name => {
    const response = validTaskDefinition();
    Object.assign(response.taskDefinition.containerDefinitions[0], {
      secrets: [
        {
          name,
          valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/blocked"
        }
      ]
    });

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it("rejects case-insensitive duplicate environment names", () => {
    const response = validTaskDefinition();
    response.taskDefinition.containerDefinitions[0].environment.push({
      name: "aws_region",
      value: "us-west-2"
    });

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it("rejects duplicate secret names and mixed environment/secret names", () => {
    const response = validTaskDefinition();
    response.taskDefinition.containerDefinitions[0].environment.push({
      name: "PORT",
      value: "80"
    });
    Object.assign(response.taskDefinition.containerDefinitions[0], {
      secrets: [
        {
          name: "port",
          valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/port"
        },
        {
          name: "DB_PASSWORD",
          valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/db-a"
        },
        {
          name: "db_password",
          valueFrom: "arn:aws:ssm:us-east-1:881424867096:parameter/db-b"
        }
      ]
    });

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });

  it.each([
    [
      "environment",
      (response: ReturnType<typeof validTaskDefinition>) => {
        response.taskDefinition.containerDefinitions[0].environment.push(
          null as unknown as { name: string; value: string }
        );
      }
    ],
    [
      "environment value",
      (response: ReturnType<typeof validTaskDefinition>) => {
        response.taskDefinition.containerDefinitions[0].environment.push(
          { name: "PORT" } as unknown as { name: string; value: string }
        );
      }
    ],
    [
      "environment name",
      (response: ReturnType<typeof validTaskDefinition>) => {
        response.taskDefinition.containerDefinitions[0].environment.push({
          name: "   ",
          value: "ignored"
        });
      }
    ],
    [
      "whitespace-padded environment name",
      (response: ReturnType<typeof validTaskDefinition>) => {
        response.taskDefinition.containerDefinitions[0].environment.push({
          name: " AWS_REGION",
          value: "us-east-1"
        });
      }
    ],
    [
      "environment name containing a space",
      (response: ReturnType<typeof validTaskDefinition>) => {
        response.taskDefinition.containerDefinitions[0].environment.push({
          name: "AWS REGION",
          value: "us-east-1"
        });
      }
    ],
    [
      "secret",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [null]
        });
      }
    ],
    [
      "secret valueFrom",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [{ name: "DB_PASSWORD" }]
        });
      }
    ],
    [
      "blank secret valueFrom",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [{ name: "DB_PASSWORD", valueFrom: "   " }]
        });
      }
    ],
    [
      "whitespace-padded secret valueFrom",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [
            {
              name: "DB_PASSWORD",
              valueFrom:
                " arn:aws:ssm:us-east-1:881424867096:parameter/password "
            }
          ]
        });
      }
    ],
    [
      "whitespace-padded secret name",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [
            {
              name: "AVATAR_S3_BUCKET ",
              valueFrom:
                "arn:aws:ssm:us-east-1:881424867096:parameter/blocked"
            }
          ]
        });
      }
    ],
    [
      "secret name containing a control character",
      (response: ReturnType<typeof validTaskDefinition>) => {
        Object.assign(response.taskDefinition.containerDefinitions[0], {
          secrets: [
            {
              name: "DB\tPASSWORD",
              valueFrom:
                "arn:aws:ssm:us-east-1:881424867096:parameter/password"
            }
          ]
        });
      }
    ]
  ] as const)("fails closed for malformed %s entries", (_name, mutate) => {
    const response = validTaskDefinition();
    mutate(response);

    expectInvalid(() =>
      validateTaskDefinition(response, {
        containerName: "Main",
        bucket,
        runtimeRegion: "us-east-1",
        taskRoleArn,
        taskDefinitionArn
      })
    );
  });
});

describe("rendered ECS task definition", () => {
  function validRenderedTaskDefinition() {
    const task = validTaskDefinition().taskDefinition;
    const {
      status: _status,
      taskDefinitionArn: _taskDefinitionArn,
      ...rendered
    } = task;
    return rendered;
  }

  const expected = {
    containerName: "Main",
    bucket,
    runtimeRegion: "us-east-1",
    taskRoleArn
  };

  it("accepts render-action JSON without requiring live ACTIVE metadata", () => {
    expect(
      validateRenderedTaskDefinition(validRenderedTaskDefinition(), expected)
    ).toEqual({ taskRoleArn });
  });

  it.each([
    ["missing task role", (task: ReturnType<typeof validRenderedTaskDefinition>) => {
      delete (task as { taskRoleArn?: string }).taskRoleArn;
    }],
    ["missing bucket", (task: ReturnType<typeof validRenderedTaskDefinition>) => {
      task.containerDefinitions[0].environment =
        task.containerDefinitions[0].environment.filter(
          item => item.name !== "AVATAR_S3_BUCKET"
        );
    }],
    ["wrong region", (task: ReturnType<typeof validRenderedTaskDefinition>) => {
      task.containerDefinitions[0].environment[1].value = "us-west-2";
    }],
    ["legacy region", (task: ReturnType<typeof validRenderedTaskDefinition>) => {
      task.containerDefinitions[0].environment.push({
        name: "AVATAR_S3_REGION",
        value: "us-east-1"
      });
    }],
    ["static credentials", (task: ReturnType<typeof validRenderedTaskDefinition>) => {
      task.containerDefinitions[0].environment.push({
        name: "AWS_ACCESS_KEY_ID",
        value: "blocked"
      });
    }]
  ] as const)("rejects %s", (_name, mutate) => {
    const task = validRenderedTaskDefinition();
    mutate(task);

    expectInvalid(() => validateRenderedTaskDefinition(task, expected));
  });

  it("reads and validates the render action output without an AWS boundary", async () => {
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify(validRenderedTaskDefinition())
    );
    const log = vi.fn();

    await expect(
      runRenderedTaskPreflight({
        env,
        taskDefinitionPath: "/tmp/rendered-task-definition.json",
        readFile,
        log
      })
    ).resolves.toEqual({ checks: ["rendered-task-definition"] });
    expect(readFile).toHaveBeenCalledWith(
      "/tmp/rendered-task-definition.json",
      "utf8"
    );
    expect(log).toHaveBeenCalledWith("PASS rendered ECS task definition");
  });

  it.each([
    ["file read", vi.fn().mockRejectedValue(new Error("SECRET file path"))],
    ["malformed JSON", vi.fn().mockResolvedValue('{"SECRET":')]
  ])("redacts %s failures", async (_name, readFile) => {
    await expect(
      runRenderedTaskPreflight({
        env,
        taskDefinitionPath: "/tmp/rendered-task-definition.json",
        readFile,
        log: vi.fn()
      })
    ).rejects.toSatisfy(
      (error: Error) =>
        /prerequisite/i.test(error.message) &&
        !/SECRET|file path/.test(error.message)
    );
  });
});

describe("S3 bucket controls", () => {
  it("requires all four public access block flags", () => {
    const block = {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      }
    };

    expect(validatePublicAccessBlock(block)).toBeUndefined();

    for (const key of Object.keys(
      block.PublicAccessBlockConfiguration
    ) as Array<keyof typeof block.PublicAccessBlockConfiguration>) {
      expectInvalid(() =>
        validatePublicAccessBlock({
          PublicAccessBlockConfiguration: {
            ...block.PublicAccessBlockConfiguration,
            [key]: false
          }
        })
      );
    }
  });

  it("requires BucketOwnerEnforced ownership", () => {
    expect(
      validateOwnershipControls({
        OwnershipControls: {
          Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }]
        }
      })
    ).toBeUndefined();

    expectInvalid(() =>
      validateOwnershipControls({
        OwnershipControls: {
          Rules: [{ ObjectOwnership: "BucketOwnerPreferred" }]
        }
      })
    );
  });

  it("requires default SSE-S3 AES256 rather than KMS", () => {
    expect(
      validateEncryption({
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "AES256"
              }
            }
          ]
        }
      })
    ).toBeUndefined();

    expectInvalid(() =>
      validateEncryption({
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: "aws:kms"
              }
            }
          ]
        }
      })
    );
  });

  it("requires POST for the exact allowed origin", () => {
    const origin = env.AVATAR_ALLOWED_ORIGIN;

    expect(
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["POST"]
            }
          ]
        },
        origin
      )
    ).toBeUndefined();

    expectInvalid(() =>
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["POST"]
            },
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["PUT"]
            }
          ]
        },
        origin
      )
    );

    expectInvalid(() =>
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["POST"]
            },
            {
              AllowedOrigins: ["https://other.example.test"],
              AllowedMethods: ["POST"]
            }
          ]
        },
        origin
      )
    );

    expectInvalid(() =>
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["POST"]
            },
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["POST"]
            }
          ]
        },
        origin
      )
    );

    expectInvalid(() =>
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["POST"]
            },
            {
              AllowedOrigins: ["https://other.example.test"],
              AllowedMethods: ["GET"]
            }
          ]
        },
        origin
      )
    );

    expectInvalid(() =>
      validateCors(
        {
          CORSRules: [
            {
              AllowedOrigins: [origin],
              AllowedMethods: ["POST"]
            },
            {
              AllowedOrigins: ["*"],
              AllowedMethods: ["GET"]
            }
          ]
        },
        origin
      )
    );

    for (const rules of [
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["POST", "PUT"]
        }
      ],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["POST"]
        },
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["GET"]
        }
      ],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["POST"]
        },
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["POST"]
        }
      ]
    ]) {
      expectInvalid(() => validateCors({ CORSRules: rules }, origin));
    }

    for (const rules of [
      [],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["PUT"]
        }
      ],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["GET"]
        }
      ],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["HEAD"]
        }
      ],
      [
        {
          AllowedOrigins: [origin],
          AllowedMethods: ["post"]
        }
      ],
      [
        {
          AllowedOrigins: [origin, origin],
          AllowedMethods: ["POST"]
        }
      ],
      [null],
      [{ AllowedOrigins: [origin] }],
      [{ AllowedOrigins: [origin], AllowedMethods: [] }]
    ]) {
      expectInvalid(() => validateCors({ CORSRules: rules }, origin));
    }
  });

  it("requires an enabled one-day original/pending lifecycle rule", () => {
    expect(
      validateLifecycle({
        Rules: [
          {
            Status: "Enabled",
            Filter: { Prefix: "original/pending/" },
            Expiration: { Days: 1 }
          }
        ]
      })
    ).toBeUndefined();

    for (const rule of [
      {
        Status: "Disabled",
        Filter: { Prefix: "original/pending/" },
        Expiration: { Days: 1 }
      },
      {
        Status: "Enabled",
        Filter: { Prefix: "original/" },
        Expiration: { Days: 1 }
      },
      {
        Status: "Enabled",
        Filter: { Prefix: "original/pending/" },
        Expiration: { Days: 2 }
      }
    ]) {
      expectInvalid(() => validateLifecycle({ Rules: [rule] }));
    }

    expectInvalid(() =>
      validateLifecycle({
        Rules: [
          {
            Status: "Enabled",
            Filter: { Prefix: "original/pending/" },
            Expiration: { Days: 1 }
          },
          {
            Status: "Enabled",
            Filter: { Prefix: "original/" },
            Expiration: { Days: 1 }
          }
        ]
      })
    );
  });
});

describe("IAM policy documents", () => {
  it("decodes URL-encoded managed policy documents", () => {
    const encoded = encodeURIComponent(JSON.stringify(validTaskPolicy()));

    expect(decodePolicyDocument(encoded)).toEqual(validTaskPolicy());
  });

  it("accepts string and array policy fields for the exact task permissions", () => {
    expect(validateTaskRolePolicy(validTaskPolicy(), bucket)).toBeUndefined();

    const arrayCondition = validTaskPolicy();
    arrayCondition.Statement[1].Condition = {
      StringLike: {
        "s3:prefix": ["original/*"]
      }
    };
    arrayCondition.Statement[1].Resource = [bucketArn];

    expect(
      validateTaskRolePolicy(arrayCondition, bucket)
    ).toBeUndefined();
  });

  it.each(["s3:PutObject", "s3:GetObject"] as const)(
    "rejects a named policy missing %s",
    action => {
      const policy = validTaskPolicy();
      policy.Statement[0].Action = policy.Statement[0].Action.filter(
        item => item !== action
      );

      expectInvalid(() => validateTaskRolePolicy(policy, bucket));
    }
  );

  it("does not let Deny satisfy a required Allow", () => {
    const policy = validTaskPolicy();
    policy.Statement[0].Effect = "Deny";

    expectInvalid(() => validateTaskRolePolicy(policy, bucket));
  });

  it.each([
    undefined,
    { StringLike: { "s3:prefix": "*" } },
    { StringLike: { "s3:prefix": ["original/*", "other/*"] } },
    { StringLike: { "s3:prefix": "original/pending/*" } }
  ])("rejects a missing or non-exact ListBucket prefix condition", condition => {
    const policy = validTaskPolicy();
    policy.Statement[1].Condition = condition;

    expectInvalid(() => validateTaskRolePolicy(policy, bucket));
  });

  it.each(["*", `${bucketArn}/*`, `${bucketArn}/orig*`])(
    "rejects broad named object resource %s",
    resource => {
      const policy = validTaskPolicy();
      policy.Statement[0].Resource = resource;

      expectInvalid(() => validateTaskRolePolicy(policy, bucket));
    }
  );

  it.each(["s3:DeleteObject", "s3:GetObject*", "s3:PutObject*"])(
    "rejects unexpected named object action %s even on original/*",
    action => {
      const policy = validTaskPolicy();
      policy.Statement[0].Action.push(action);

      expectInvalid(() => validateTaskRolePolicy(policy, bucket));
    }
  );

  it("rejects a ListBucket action wildcard", () => {
    const policy = validTaskPolicy();
    policy.Statement[1].Action = "s3:List*";

    expectInvalid(() => validateTaskRolePolicy(policy, bucket));
  });

  it("rejects broad object grants in any additional policy", () => {
    expectInvalid(() =>
      validateNoBroadS3ObjectGrants(
        [
          {
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObject",
              Resource: `${bucketArn}/*`
            }
          }
        ],
        bucket
      )
    );
  });

  it("recognizes IAM single-character action wildcards as object grants", () => {
    expectInvalid(() =>
      validateNoBroadS3ObjectGrants(
        [
          {
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObjec?",
              Resource: "*"
            }
          }
        ],
        bucket
      )
    );
  });

  it.each([
    "s3:GetObjectVersion",
    "s3:PutObjectRetention",
    "s3:BypassGovernanceRetention",
    "s3:ReplicateDelete"
  ])("recognizes %s as an object-level grant", action => {
    expectInvalid(() =>
      validateNoBroadS3ObjectGrants(
        [
          {
            Statement: {
              Effect: "Allow",
              Action: action,
              Resource: "*"
            }
          }
        ],
        bucket
      )
    );
  });

  it.each([
    {
      Effect: "Allow",
      NotAction: "s3:ListBucket",
      Resource: "*"
    },
    {
      Effect: "Allow",
      Action: "s3:GetObject",
      NotResource: objectArn
    }
  ])("fails closed for NotAction or NotResource", statement => {
    expectInvalid(() =>
      validateNoBroadS3ObjectGrants([{ Statement: statement }], bucket)
    );
  });

  it.each([
    "*",
    `${bucketArn}/*`,
    `${bucketArn}/original*`,
    "arn:aws:s3:::another-bucket/original/*"
  ])("rejects object resource wildcard outside the exact prefix: %s", resource => {
    expectInvalid(() =>
      validateNoBroadS3ObjectGrants(
        [
          {
            Statement: {
              Effect: "Allow",
              Action: "s3:GetObjectVersion",
              Resource: resource
            }
          }
        ],
        bucket
      )
    );
  });

  it("accepts unrelated non-S3 permissions, Deny, and narrower object grants", () => {
    expect(
      validateNoBroadS3ObjectGrants(
        [
          {
            Statement: [
              {
                Effect: "Allow",
                Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
                Resource: "*"
              },
              {
                Effect: "Deny",
                Action: "s3:GetObject",
                Resource: "*"
              },
              {
                Effect: "Allow",
                Action: "s3:GetObject",
                Resource: `${bucketArn}/original/confirmed/*`
              }
            ]
          }
        ],
        bucket
      )
    ).toBeUndefined();
  });

  it("rejects broad ListBucket and extra object actions in any task-role policy", () => {
    expectInvalid(() =>
      validateTaskRolePolicyBoundaries(
        [
          validTaskPolicy(),
          {
            Statement: {
              Effect: "Allow",
              Action: "s3:ListBucket",
              Resource: bucketArn
            }
          }
        ],
        bucket
      )
    );
    expectInvalid(() =>
      validateTaskRolePolicyBoundaries(
        [
          validTaskPolicy(),
          {
            Statement: {
              Effect: "Allow",
              Action: "s3:DeleteObject",
              Resource: objectArn
            }
          }
        ],
        bucket
      )
    );
  });

  it("accepts broad existing deploy attachments while requiring every read action", () => {
    expect(
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Allow",
              Action: ["ecr:*", "ecs:*"],
              Resource: "*"
            }
          },
          {
            Statement: {
              Effect: "Allow",
              NotAction: ["iam:CreateUser", "iam:CreateRole"],
              Resource: "*"
            }
          }
        ],
        deployReadResources()
      )
    ).toBeUndefined();
  });

  it("fails the deploy role hard gate when one read action is absent", () => {
    const policy = scopedDeployPolicy();
    policy.Statement.pop();

    expectInvalid(() =>
      validateDeployRoleReadPolicies([policy], deployReadResources())
    );
  });

  it("does not accept deploy read actions scoped to an unrelated resource", () => {
    const policy = scopedDeployPolicy();
    policy.Statement[2].Resource =
      "arn:aws:s3:::unrelated-bucket";

    expectInvalid(() =>
      validateDeployRoleReadPolicies([policy], deployReadResources())
    );
  });

  it("does not let Resource star satisfy actions that support resource scope", () => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [validDeployPolicy()],
        deployReadResources()
      )
    );
  });

  it("does not let a broad action attachment provide missing read evidence", () => {
    const policy = scopedDeployPolicy();
    policy.Statement[0].Action = "ecs:ListServices";

    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [
          policy,
          {
            Statement: {
              Effect: "Allow",
              Action: "ecs:*",
              Resource: serviceArn
            }
          }
        ],
        deployReadResources()
      )
    );
  });

  it("allows Resource star for the required DescribeTaskDefinition read", () => {
    expect(
      validateDeployRoleReadPolicies(
        [scopedDeployPolicy()],
        deployReadResources()
      )
    ).toBeUndefined();
  });

  it("does not let Resource star satisfy SimulatePrincipalPolicy", () => {
    const policy = scopedDeployPolicy();
    policy.Statement[5].Resource = "*";

    expectInvalid(() =>
      validateDeployRoleReadPolicies([policy], deployReadResources())
    );
  });

  it("fails the deploy role hard gate for an explicit read deny", () => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Deny",
              Action: "iam:GetPolicyVersion",
              Resource: "*"
            }
          }
        ],
        deployReadResources()
      )
    );
  });

  it.each([
    [
      "bucket",
      "s3:GetBucketCors",
      "arn:aws:s3:::unrelated-avatar-bucket"
    ],
    [
      "role",
      "iam:GetRolePolicy",
      "arn:aws:iam::881424867096:role/unrelated-role"
    ],
    [
      "service",
      "ecs:DescribeServices",
      "arn:aws:ecs:us-east-1:881424867096:service/default/unrelated-service"
    ]
  ])("allows an otherwise valid policy with a disjoint %s deny", (
    _name,
    action,
    resource
  ) => {
    expect(
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Deny",
              Action: action,
              Resource: resource
            }
          }
        ],
        deployReadResources()
      )
    ).toBeUndefined();
  });

  it.each([
    ["exact required resource", bucketArn],
    ["wildcard covering the required resource", "arn:aws:s3:::recontent-avatar-*"],
    ["all resources", "*"],
    ["mixed resources with a partial overlap", [
      "arn:aws:s3:::unrelated-avatar-bucket",
      bucketArn
    ]]
  ])("rejects a bucket deny on %s", (_name, resource) => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Deny",
              Action: "s3:GetBucketCors",
              Resource: resource
            }
          }
        ],
        deployReadResources()
      )
    );
  });

  it.each([
    {
      Effect: "Deny",
      NotAction: "iam:DeleteRole",
      Resource: taskRoleArn
    },
    {
      Effect: "Deny",
      Action: "iam:GetRolePolicy",
      NotResource: "arn:aws:iam::881424867096:role/unrelated-role"
    },
    {
      Effect: "Deny",
      Action: "s3:GetBucketCors",
      Resource: "arn:aws:s3:::${aws:PrincipalTag/bucket}"
    }
  ])("fails closed for an uninterpretable deny scope", statement => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [scopedDeployPolicy(), { Statement: statement }],
        deployReadResources()
      )
    );
  });

  it.each([
    [
      "an action array containing the required action",
      {
        Effect: "Deny",
        Action: ["s3:DeleteBucket", "s3:GetBucketCors"],
        Resource: bucketArn
      }
    ],
    [
      "a single-character resource wildcard covering the target",
      {
        Effect: "Deny",
        Action: "s3:GetBucketCors",
        Resource: "arn:aws:s3:::recontent-avatar-pipeline-2026072?"
      }
    ],
    [
      "a malformed resource",
      {
        Effect: "Deny",
        Action: "s3:GetBucketCors",
        Resource: "not-an-arn"
      }
    ],
    [
      "a conditioned overlap",
      {
        Effect: "Deny",
        Action: "s3:GetBucketCors",
        Resource: bucketArn,
        Condition: {
          StringEquals: {
            "aws:PrincipalTag/environment": "unknown"
          }
        }
      }
    ],
    [
      "case-variant action overlap",
      {
        Effect: "Deny",
        Action: "S3:GetBucketCors",
        Resource: bucketArn
      }
    ],
    [
      "an all-action deny with an otherwise unrelated resource",
      {
        Effect: "Deny",
        Action: "*",
        Resource: "arn:aws:s3:::unrelated-avatar-bucket"
      }
    ]
  ])("fails closed for %s", (_name, statement) => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [scopedDeployPolicy(), { Statement: statement }],
        deployReadResources()
      )
    );
  });

  it("allows a deny action array that cannot match a required read", () => {
    expect(
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Deny",
              Action: ["s3:DeleteBucket", "iam:DeleteRole"],
              Resource: "*"
            }
          }
        ],
        deployReadResources()
      )
    ).toBeUndefined();
  });

  it.each([
    "*",
    "arn:aws:ecs:us-east-1:881424867096:task-definition/unrelated:1"
  ])("fails closed for a star-only action deny on %s", resource => {
    expectInvalid(() =>
      validateDeployRoleReadPolicies(
        [
          scopedDeployPolicy(),
          {
            Statement: {
              Effect: "Deny",
              Action: "ecs:DescribeTaskDefinition",
              Resource: resource
            }
          }
        ],
        deployReadResources()
      )
    );
  });
});

describe("IAM role policy listings", () => {
  const inline = {
    PolicyNames: ["named-policy", "logs"],
    IsTruncated: false
  };
  const attached = {
    AttachedPolicies: [
      {
        PolicyName: "managed-logs",
        PolicyArn: managedPolicyArn
      }
    ],
    IsTruncated: false
  };

  it("accepts complete unique inline and attached policy listings", () => {
    expect(validateRolePolicyListings(inline, attached)).toEqual({
      inlineNames: inline.PolicyNames,
      attachedPolicies: attached.AttachedPolicies
    });
  });

  it.each([
    [{ ...inline, IsTruncated: true }, attached],
    [{ ...inline, Marker: "next-page" }, attached],
    [{ ...inline, IsTruncated: "false" }, attached],
    [{ ...inline, PolicyNames: ["logs", "logs"] }, attached],
    [inline, { ...attached, IsTruncated: true }],
    [inline, { ...attached, Marker: "next-page" }],
    [
      inline,
      {
        ...attached,
        AttachedPolicies: [
          attached.AttachedPolicies[0],
          attached.AttachedPolicies[0]
        ]
      }
    ],
    [
      inline,
      {
        ...attached,
        AttachedPolicies: [{ PolicyName: "missing-arn" }]
      }
    ]
  ] as const)("fails closed for truncated, malformed, or duplicate listings", (
    inlineResponse,
    attachedResponse
  ) => {
    expectInvalid(() =>
      validateRolePolicyListings(inlineResponse, attachedResponse)
    );
  });
});

describe("effective task-role simulation", () => {
  it("requires exact allows under original and accepts both deny decisions outside it", () => {
    expect(validateSimulation(validSimulation(), bucket)).toBeUndefined();
  });

  it.each([
    [
      "an extra allowed DeleteObject result",
      {
        EvalActionName: "s3:DeleteObject",
        EvalResourceName: `${bucketArn}/original/preflight-check`,
        EvalDecision: "allowed"
      }
    ],
    [
      "an extra action result",
      {
        EvalActionName: "s3:ListBucket",
        EvalResourceName: `${bucketArn}/original/preflight-check`,
        EvalDecision: "implicitDeny"
      }
    ],
    [
      "an extra resource result",
      {
        EvalActionName: "s3:DeleteObject",
        EvalResourceName: `${bucketArn}/outside/unexpected`,
        EvalDecision: "implicitDeny"
      }
    ]
  ])("rejects %s", (_name, extraResult) => {
    const simulation = validSimulation();
    simulation.objectInside.EvaluationResults.push(extraResult);

    expectInvalid(() => validateSimulation(simulation, bucket));
  });

  it("rejects a duplicate expected action result", () => {
    const simulation = validSimulation();
    simulation.objectInside.EvaluationResults.push({
      ...simulation.objectInside.EvaluationResults[0]
    });

    expectInvalid(() => validateSimulation(simulation, bucket));
  });

  it.each([
    ["required implicit deny", "objectInside", "s3:PutObject", "implicitDeny"],
    ["required explicit deny", "listOriginal", "s3:ListBucket", "explicitDeny"],
    ["outside allow", "objectOutside", "s3:GetObject", "allowed"],
    ["outside ListBucket allow", "listOutside", "s3:ListBucket", "allowed"],
    ["unknown outside decision", "objectOutside", "s3:GetObject", "unknown"]
  ] as const)("rejects %s", (_name, section, action, decision) => {
    const simulation = {
      objectInside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:PutObject",
            EvalResourceName: `${bucketArn}/original/preflight-check`,
            EvalDecision: "allowed"
          },
          {
            EvalActionName: "s3:GetObject",
            EvalResourceName: `${bucketArn}/original/preflight-check`,
            EvalDecision: "allowed"
          }
        ]
      },
      listOriginal: {
        EvaluationResults: [
          {
            EvalActionName: "s3:ListBucket",
            EvalResourceName: bucketArn,
            EvalDecision: "allowed"
          }
        ]
      },
      objectOutside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:PutObject",
            EvalResourceName: `${bucketArn}/outside/preflight-check`,
            EvalDecision: "implicitDeny"
          },
          {
            EvalActionName: "s3:GetObject",
            EvalResourceName: `${bucketArn}/outside/preflight-check`,
            EvalDecision: "implicitDeny"
          }
        ]
      },
      listOutside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:ListBucket",
            EvalResourceName: bucketArn,
            EvalDecision: "implicitDeny"
          }
        ]
      }
    };
    const result = simulation[section].EvaluationResults.find(
      item => item.EvalActionName === action
    );
    result!.EvalDecision = decision;

    expectInvalid(() => validateSimulation(simulation, bucket));
  });

  it("rejects simulation results for a different resource", () => {
    const simulation = {
      objectInside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:PutObject",
            EvalResourceName: `${bucketArn}/outside/wrong`,
            EvalDecision: "allowed"
          },
          {
            EvalActionName: "s3:GetObject",
            EvalResourceName: `${bucketArn}/original/preflight-check`,
            EvalDecision: "allowed"
          }
        ]
      },
      listOriginal: {
        EvaluationResults: [
          {
            EvalActionName: "s3:ListBucket",
            EvalResourceName: bucketArn,
            EvalDecision: "allowed"
          }
        ]
      },
      objectOutside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:PutObject",
            EvalResourceName: `${bucketArn}/outside/preflight-check`,
            EvalDecision: "implicitDeny"
          },
          {
            EvalActionName: "s3:GetObject",
            EvalResourceName: `${bucketArn}/outside/preflight-check`,
            EvalDecision: "implicitDeny"
          }
        ]
      },
      listOutside: {
        EvaluationResults: [
          {
            EvalActionName: "s3:ListBucket",
            EvalResourceName: bucketArn,
            EvalDecision: "implicitDeny"
          }
        ]
      }
    };

    expectInvalid(() => validateSimulation(simulation, bucket));
  });
});

describe("AWS CLI JSON boundary", () => {
  it("parses only JSON objects", () => {
    expect(parseAwsJson('{"Policy":{"DefaultVersionId":"v1"}}')).toEqual({
      Policy: { DefaultVersionId: "v1" }
    });

    for (const output of ["", "not-json SECRET", "[]", "null"]) {
      expect(() => parseAwsJson(output)).toThrow("AWS prerequisite check failed.");
    }
  });

  it("never exposes CLI stderr or malformed stdout", async () => {
    const executor = vi.fn(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error, stdout: string, stderr: string) => void
      ) => {
        callback(
          new Error("request-id=private"),
          '{"Policy":"SECRET"}',
          "token=SECRET policy={bucket/key}"
        );
      }
    );
    const aws = createAwsCliExecutor(executor);

    await expect(aws(["iam", "get-policy"])).rejects.toSatisfy(
      (error: Error) =>
        error.message === "AWS prerequisite check failed." &&
        !/SECRET|request-id|bucket\/key|token|policy=/.test(error.message)
    );
  });
});

describe("preflight orchestration", () => {
  function createAwsFake() {
    const namedPolicy = validTaskPolicy();
    const responses = new Map<string, unknown>([
      [
        "ecs describe-services",
        {
          services: [
            {
              serviceName: env.ECS_SERVICE,
              status: "ACTIVE",
              taskDefinition: taskDefinitionArn
            }
          ],
          failures: []
        }
      ],
      ["ecs describe-task-definition", validTaskDefinition()],
      [
        "s3api get-public-access-block",
        {
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true
          }
        }
      ],
      [
        "s3api get-bucket-ownership-controls",
        {
          OwnershipControls: {
            Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }]
          }
        }
      ],
      [
        "s3api get-bucket-encryption",
        {
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: "AES256"
                }
              }
            ]
          }
        }
      ],
      [
        "s3api get-bucket-cors",
        {
          CORSRules: [
            {
              AllowedOrigins: [env.AVATAR_ALLOWED_ORIGIN],
              AllowedMethods: ["POST"]
            }
          ]
        }
      ],
      [
        "s3api get-bucket-lifecycle-configuration",
        {
          Rules: [
            {
              Status: "Enabled",
              Filter: { Prefix: "original/pending/" },
              Expiration: { Days: 1 }
            }
          ]
        }
      ],
      [
        `iam get-role-policy ${env.AVATAR_TASK_ROLE_NAME} ${env.AVATAR_TASK_POLICY_NAME}`,
        {
          RoleName: env.AVATAR_TASK_ROLE_NAME,
          PolicyName: env.AVATAR_TASK_POLICY_NAME,
          PolicyDocument: namedPolicy
        }
      ],
      [
        `iam list-role-policies ${env.AVATAR_TASK_ROLE_NAME}`,
        {
          PolicyNames: [env.AVATAR_TASK_POLICY_NAME, "task-logs"],
          IsTruncated: false
        }
      ],
      [
        `iam get-role-policy ${env.AVATAR_TASK_ROLE_NAME} task-logs`,
        {
          RoleName: env.AVATAR_TASK_ROLE_NAME,
          PolicyName: "task-logs",
          PolicyDocument: {
            Statement: {
              Effect: "Allow",
              Action: "logs:PutLogEvents",
              Resource: "*"
            }
          }
        }
      ],
      [
        `iam list-attached-role-policies ${env.AVATAR_TASK_ROLE_NAME}`,
        {
          AttachedPolicies: [
            {
              PolicyName: "recontent-task-observability",
              PolicyArn: managedPolicyArn
            }
          ],
          IsTruncated: false
        }
      ],
      [
        `iam get-policy ${managedPolicyArn}`,
        {
          Policy: {
            Arn: managedPolicyArn,
            DefaultVersionId: "v3"
          }
        }
      ],
      [
        `iam get-policy-version ${managedPolicyArn} v3`,
        {
          PolicyVersion: {
            Document: encodeURIComponent(
              JSON.stringify({
                Statement: {
                  Effect: "Allow",
                  Action: "logs:PutLogEvents",
                  Resource: "*"
                }
              })
            ),
            VersionId: "v3",
            IsDefaultVersion: true
          }
        }
      ],
      [
        `iam list-role-policies ${env.GITHUB_DEPLOY_ROLE_NAME}`,
        { PolicyNames: ["preflight-read"], IsTruncated: false }
      ],
      [
        `iam get-role-policy ${env.GITHUB_DEPLOY_ROLE_NAME} preflight-read`,
        {
          RoleName: env.GITHUB_DEPLOY_ROLE_NAME,
          PolicyName: "preflight-read",
          PolicyDocument: scopedDeployPolicy()
        }
      ],
      [
        `iam list-attached-role-policies ${env.GITHUB_DEPLOY_ROLE_NAME}`,
        { AttachedPolicies: [], IsTruncated: false }
      ]
    ]);
    let simulationCall = 0;
    const aws = vi.fn(async (args: string[]) => {
      const command = args.slice(0, 2).join(" ");

      if (command === "iam simulate-principal-policy") {
        simulationCall += 1;
        if (simulationCall === 1) {
          return {
            EvaluationResults: [
              {
                EvalActionName: "s3:PutObject",
                EvalResourceName: `${bucketArn}/original/preflight-check`,
                EvalDecision: "allowed"
              },
              {
                EvalActionName: "s3:GetObject",
                EvalResourceName: `${bucketArn}/original/preflight-check`,
                EvalDecision: "allowed"
              }
            ]
          };
        }
        if (simulationCall === 2) {
          return {
            EvaluationResults: [
              {
                EvalActionName: "s3:ListBucket",
                EvalResourceName: bucketArn,
                EvalDecision: "allowed"
              }
            ]
          };
        }
        if (simulationCall === 3) {
          return {
            EvaluationResults: [
              {
                EvalActionName: "s3:PutObject",
                EvalResourceName: `${bucketArn}/outside/preflight-check`,
                EvalDecision: "implicitDeny"
              },
              {
                EvalActionName: "s3:GetObject",
                EvalResourceName: `${bucketArn}/outside/preflight-check`,
                EvalDecision: "explicitDeny"
              }
            ]
          };
        }
        return {
          EvaluationResults: [
            {
              EvalActionName: "s3:ListBucket",
              EvalResourceName: bucketArn,
              EvalDecision: "implicitDeny"
            }
          ]
        };
      }

      let key = command;
      const roleNameIndex = args.indexOf("--role-name");
      const policyNameIndex = args.indexOf("--policy-name");
      const policyArnIndex = args.indexOf("--policy-arn");
      const versionIdIndex = args.indexOf("--version-id");
      if (roleNameIndex !== -1) {
        key += ` ${args[roleNameIndex + 1]}`;
      }
      if (policyNameIndex !== -1) {
        key += ` ${args[policyNameIndex + 1]}`;
      }
      if (policyArnIndex !== -1) {
        key += ` ${args[policyArnIndex + 1]}`;
      }
      if (versionIdIndex !== -1) {
        key += ` ${args[versionIdIndex + 1]}`;
      }

      if (!responses.has(key)) {
        throw new Error(`missing fake response for ${key}`);
      }

      return responses.get(key);
    });

    return aws;
  }

  it("runs only injected JSON reads and locks simulation arguments", async () => {
    const aws = createAwsFake();
    const logs: string[] = [];

    await expect(
      runPreflight({ env, aws, log: message => logs.push(message) })
    ).resolves.toEqual({
      checks: ["ecs", "s3", "task-role", "simulation", "deploy-role"]
    });

    expect(aws).toHaveBeenCalledWith([
      "iam",
      "simulate-principal-policy",
      "--policy-source-arn",
      taskRoleArn,
      "--action-names",
      "s3:PutObject",
      "s3:GetObject",
      "--resource-arns",
      `${bucketArn}/original/preflight-check`,
      "--output",
      "json"
    ]);
    expect(aws).toHaveBeenCalledWith([
      "iam",
      "simulate-principal-policy",
      "--policy-source-arn",
      taskRoleArn,
      "--action-names",
      "s3:ListBucket",
      "--resource-arns",
      bucketArn,
      "--context-entries",
      "ContextKeyName=s3:prefix,ContextKeyValues=outside/preflight-check,ContextKeyType=string",
      "--output",
      "json"
    ]);
    expect(aws).toHaveBeenCalledWith([
      "iam",
      "simulate-principal-policy",
      "--policy-source-arn",
      taskRoleArn,
      "--action-names",
      "s3:PutObject",
      "s3:GetObject",
      "--resource-arns",
      `${bucketArn}/outside/preflight-check`,
      "--output",
      "json"
    ]);
    expect(aws).toHaveBeenCalledWith([
      "iam",
      "get-policy",
      "--policy-arn",
      managedPolicyArn,
      "--output",
      "json"
    ]);
    expect(aws).toHaveBeenCalledWith([
      "iam",
      "get-policy-version",
      "--policy-arn",
      managedPolicyArn,
      "--version-id",
      "v3",
      "--output",
      "json"
    ]);
    expect(aws).toHaveBeenCalledWith([
      "iam",
      "simulate-principal-policy",
      "--policy-source-arn",
      taskRoleArn,
      "--action-names",
      "s3:ListBucket",
      "--resource-arns",
      bucketArn,
      "--context-entries",
      "ContextKeyName=s3:prefix,ContextKeyValues=original/preflight-check,ContextKeyType=string",
      "--output",
      "json"
    ]);
    expect(logs.join("\n")).not.toMatch(
      /881424867096|recontent-avatar-pipeline|original\/|policy/i
    );
  });

  it("does not require managed-policy reads when neither role has attachments", async () => {
    const aws = createAwsFake();
    const implementation = aws.getMockImplementation()!;
    const deployPolicy = scopedDeployPolicy();
    deployPolicy.Statement.push({
      Effect: "Allow",
      Action: "*",
      Resource: "*"
    });

    aws.mockImplementation(async args => {
      if (args[0] === "iam" && args[1] === "list-attached-role-policies") {
        return { AttachedPolicies: [], IsTruncated: false };
      }
      if (
        args[0] === "iam" &&
        args[1] === "get-role-policy" &&
        args.includes(env.GITHUB_DEPLOY_ROLE_NAME)
      ) {
        return {
          RoleName: env.GITHUB_DEPLOY_ROLE_NAME,
          PolicyName: "preflight-read",
          PolicyDocument: deployPolicy
        };
      }
      return implementation(args);
    });

    await expect(
      runPreflight({ env, aws, log: vi.fn() })
    ).resolves.toEqual({
      checks: ["ecs", "s3", "task-role", "simulation", "deploy-role"]
    });
    expect(aws).not.toHaveBeenCalledWith(
      expect.arrayContaining(["iam", "get-policy"])
    );
    expect(aws).not.toHaveBeenCalledWith(
      expect.arrayContaining(["iam", "get-policy-version"])
    );
  });

  it("fails closed for a missing or ambiguous ECS service", async () => {
    const aws = createAwsFake();
    aws.mockImplementationOnce(async () => ({ services: [], failures: [] }));

    await expect(runPreflight({ env, aws, log: vi.fn() })).rejects.toThrow(
      /prerequisite/i
    );
  });

  it("fails closed when a role policy listing remains truncated", async () => {
    const aws = createAwsFake();
    const implementation = aws.getMockImplementation()!;
    aws.mockImplementation(async args => {
      if (
        args[0] === "iam" &&
        args[1] === "list-role-policies"
      ) {
        return {
          PolicyNames: [env.AVATAR_TASK_POLICY_NAME],
          IsTruncated: true,
          Marker: "next-page"
        };
      }
      return implementation(args);
    });

    await expect(runPreflight({ env, aws, log: vi.fn() })).rejects.toThrow(
      /prerequisite/i
    );
  });

  it("rejects a managed policy response that is not the default version", async () => {
    const aws = createAwsFake();
    const implementation = aws.getMockImplementation()!;
    aws.mockImplementation(async args => {
      if (args[0] === "iam" && args[1] === "get-policy-version") {
        return {
          PolicyVersion: {
            Document: encodeURIComponent(
              JSON.stringify({
                Statement: {
                  Effect: "Allow",
                  Action: "logs:PutLogEvents",
                  Resource: "*"
                }
              })
            ),
            VersionId: "v3",
            IsDefaultVersion: false
          }
        };
      }
      return implementation(args);
    });

    await expect(runPreflight({ env, aws, log: vi.fn() })).rejects.toThrow(
      /prerequisite/i
    );
  });

  it("redacts injected AWS failures and their secret details", async () => {
    const aws = vi.fn(async () => {
      throw new Error(
        "stderr: token=SECRET policy={bucket/key} request-id=private"
      );
    });

    await expect(runPreflight({ env, aws, log: vi.fn() })).rejects.toSatisfy(
      (error: Error) =>
        /AWS prerequisite check failed/.test(error.message) &&
        !/SECRET|policy=|bucket\/key|request-id/.test(error.message)
    );
  });
});

describe("avatar deployment workflow gates", () => {
  type WorkflowStep = {
    id?: string;
    name?: string;
    run?: string;
    uses?: string;
    with?: Record<string, string>;
  };

  type Workflow = {
    concurrency?: {
      group?: string;
      "cancel-in-progress"?: boolean;
    };
    jobs: Record<string, { steps: WorkflowStep[] }>;
  };

  function loadWorkflow(file: string) {
    return parse(
      readFileSync(resolve(process.cwd(), ".github/workflows", file), "utf8")
    ) as Workflow;
  }

  function workflowJobSteps(file: string, job: string) {
    return loadWorkflow(file).jobs[job].steps;
  }

  it("serializes every production deployment without cancellation", () => {
    expect(loadWorkflow("deploy.yml").concurrency).toEqual({
      group: "recontent-production-deploy",
      "cancel-in-progress": false
    });
  });

  it("validates the rendered task definition after render and before deploy", () => {
    const steps = workflowJobSteps("deploy.yml", "deploy");
    const renderIndex = steps.findIndex(
      step => step.id === "render-task-def"
    );
    const validateIndex = steps.findIndex(
      step => step.name === "Verify rendered avatar S3 task definition"
    );
    const deployIndex = steps.findIndex(
      step =>
        step.uses === "aws-actions/amazon-ecs-deploy-task-definition@v2"
    );

    expect(renderIndex).toBeGreaterThan(-1);
    expect(validateIndex).toBeGreaterThan(renderIndex);
    expect(deployIndex).toBeGreaterThan(validateIndex);
    expect(steps[validateIndex].run).toContain(
      "node scripts/verify-avatar-s3-prerequisites.mjs --rendered-task-definition"
    );
    expect(steps[validateIndex].run).toContain(
      "${{ steps.render-task-def.outputs.task-definition }}"
    );
  });

  it("builds OpenNext after Next and still gates the Docker image", () => {
    const steps = workflowJobSteps("ci.yml", "verify");
    const nextBuildIndex = steps.findIndex(
      step => step.run === "npm run build"
    );
    const openNextIndex = steps.findIndex(
      step =>
        step.run ===
        "npx --no-install opennextjs-cloudflare build --skipNextBuild"
    );
    const dockerIndex = steps.findIndex(step =>
      step.run?.includes("docker build -t recontent:ci .")
    );

    expect(nextBuildIndex).toBeGreaterThan(-1);
    expect(openNextIndex).toBeGreaterThan(nextBuildIndex);
    expect(dockerIndex).toBeGreaterThan(openNextIndex);
  });
});
