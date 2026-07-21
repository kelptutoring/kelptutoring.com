# Acceptance evidence

## Purpose

This folder is a local staging area for screenshots, logs, exported artifacts, database output, and automated reports associated with acceptance runs.

Generated evidence is ignored by Git by default. If a small sanitized artifact is important enough to version, it must be reviewed for secrets and personal data, then explicitly allowed or moved to an appropriate fixture/documentation location.

## Naming

Organize evidence by run ID and name each artifact with its test ID:

```text
evidence/
└── RUN-20260719-001/
    ├── AUTH-001-rpc-denial.txt
    ├── WORK-002-workspace.png
    └── ASSIGN-004-delivery-projection.json
```

## Safety rules

- Use synthetic accounts and content.
- Never retain passwords, tokens, cookies, authorization headers, service-role keys, or connection strings.
- Redact email addresses and identifiers unless they are clearly fictional test values.
- Do not capture unrelated browser tabs, notifications, desktop content, or user files.
- Prefer narrow screenshots and focused logs.
- Do not treat a screenshot as proof of an RLS or server authorization boundary; retain an RPC/database assertion for those cases.
- Delete temporary evidence after its run is summarized if it provides no continuing diagnostic value.

## Evidence and results

Evidence supports a result but does not determine it by itself. The run log remains the execution record, and the acceptance reference remains the expected-behavior record.
