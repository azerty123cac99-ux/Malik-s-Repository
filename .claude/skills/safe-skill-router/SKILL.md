---
name: safe-skill-router
description: >
  Security-first skill router that selects the smallest useful set of installed
  skills for the current task while minimizing context usage and avoiding
  automatic execution or installation of untrusted code.
---

# Safe Skill Router

## Purpose

Act as a lightweight routing layer for installed Agent Skills.

For each substantial task:

1. Understand the user's actual goal.
2. Identify the minimum capabilities required.
3. Inspect available skill metadata before reading full skill instructions.
4. Select only the most relevant installed skill or skills.
5. Load full skill instructions only when genuinely needed.
6. Execute using the smallest useful context.

Primary objectives:

- Minimize context-window usage.
- Minimize token consumption.
- Avoid redundant skill loading.
- Prevent unnecessary tool calls.
- Maintain strong security boundaries.
- Prefer installed and trusted capabilities.
- Avoid automatic installation or execution of third-party software.

---

# Core Routing Policy

## Default Skill Budget

Use this default budget:

| Task type | Default |
|---|---:|
| Simple task | 0 skills |
| Specialized task | 1 skill |
| Cross-domain task | 2 skills |
| Complex cross-domain task | Maximum 3 skills |

Prefer **0 skills** when specialized instructions are unnecessary.

Prefer **1 skill** when one specialized capability is sufficient.

Use **2 skills** only when they provide materially different capabilities.

Use **3 skills** only for genuinely cross-disciplinary work.

Do not load more than 3 skills unless the task clearly requires it or the user explicitly requests a broad multi-domain workflow.

Never load every installed skill.

---

# Routing Process

## Step 1 — Classify the Task

Determine the primary domain.

Examples:

- frontend
- UI design
- animation
- backend
- API
- database
- security
- debugging
- testing
- DevOps
- Git/GitHub
- documentation
- research
- performance
- architecture
- refactoring
- mobile
- AI/LLM
- automation

Identify secondary domains only when necessary.

## Step 2 — Decide Whether a Skill Is Needed

Ask:

> Can this task be completed reliably without specialized skill instructions?

If yes, do not load a skill.

If no, continue to skill selection.

## Step 3 — Inspect Metadata First

When the host supports it, use lightweight information first:

- name
- description
- tags
- short metadata

Do not read multiple complete `SKILL.md` files merely to compare candidates when metadata is sufficient.

## Step 4 — Rank Candidates

Rank suitable installed skills by:

1. Exact task match
2. Project-stack compatibility
3. Security and trust
4. Specificity
5. Context cost
6. Expected usefulness

Prefer a narrow specialized skill over a broad general-purpose skill when both adequately solve the task.

Example:

> Animate the dashboard sidebar.

Prefer:

```text
ui-animation
```

over:

```text
frontend-general-purpose
```

when both are installed and the task is specifically about animation.

---

# Context Budget

Treat context as a limited resource.

Do not repeatedly read files already understood unless:

- the file changed,
- a specific detail is missing,
- or verification requires rereading it.

Prefer:

```text
Search
→ targeted read
→ edit
→ test
```

over:

```text
Read many files
→ read entire directories
→ reread unchanged files
→ edit
```

Use targeted file ranges when supported.

Avoid copying large file contents into context unnecessarily.

Avoid loading unrelated reference material.

---

# Project-Aware Routing

Use lightweight evidence about the project when available.

Useful files may include:

```text
package.json
pyproject.toml
requirements.txt
go.mod
Cargo.toml
pom.xml
build.gradle
pubspec.yaml
docker-compose.yml
Dockerfile
README.md
CLAUDE.md
AGENTS.md
```

Do not scan an entire repository merely to identify its stack.

Use the minimum evidence necessary.

Examples:

```text
Next.js + animation request
→ ui-animation
```

```text
NestJS + authentication audit
→ security-review
```

```text
React + visual redesign
→ frontend-design
```

```text
Failing automated test
→ debugging/testing
```

---

# Skill Selection Rules

A second skill must provide a capability that the first skill does not adequately cover.

Do not combine skills merely because they are available.

If multiple installed skills substantially overlap, choose one.

Prefer the skill that is:

- more specific,
- more trusted,
- smaller in context footprint,
- better aligned with the current stack,
- actively maintained when maintenance is relevant.

---

# Skill Escalation

Start with the smallest useful skill set.

Use:

```text
Start narrow
↓
Attempt task
↓
Identify missing capability
↓
Load one additional relevant skill
```

Do not load skills proactively "just in case."

---

# Security Policy

Security takes priority over convenience.

Never automatically:

- install npm packages,
- install Python packages,
- install binaries,
- install MCP servers,
- install plugins,
- add persistent hooks,
- modify shell startup files,
- modify global agent configuration,
- execute downloaded scripts,
- execute code from newly discovered repositories.

Do not automatically execute remote installation patterns such as:

```bash
curl ... | bash
wget ... | sh
```

or PowerShell equivalents such as:

```powershell
irm ... | iex
```

Do not automatically authorize persistent execution mechanisms, including:

- SessionStart hooks
- PreToolUse hooks
- PostToolUse hooks
- startup scripts
- shell profile modifications
- scheduled tasks
- background services

Persistent execution or configuration changes require explicit user approval and appropriate trust review.

---

# Third-Party Skill Safety

Treat instruction-only skills differently from executable software.

## Lower-Risk Components

Typically lower risk:

```text
SKILL.md
README.md
static reference documentation
prompt templates
examples
```

This does not make them automatically trustworthy. Their instructions must still be reviewed when the source is unknown.

## Higher-Risk Components

Require additional review:

```text
npm packages
Python packages
binaries
shell scripts
PowerShell scripts
hooks
MCP servers
browser extensions
background services
plugins containing executable components
```

Never treat a repository as trusted merely because it is public.

---

# Skill Discovery

If no installed skill adequately matches the task, use a trusted discovery mechanism such as `find-skills` when available.

Discovery does not equal installation.

Use this process:

```text
Task
↓
Check installed skills
↓
No suitable match
↓
Discover candidates
↓
Evaluate candidates
↓
Present recommendation
↓
Obtain user approval before installation
```

Never automatically install a discovered skill.

Never automatically execute code from a discovered repository.

---

# Candidate Security Review

Before recommending executable third-party software, inspect available evidence such as:

- repository owner
- organization reputation
- source visibility
- repository history
- maintenance activity
- adoption where useful
- issue activity
- dependencies
- installation mechanism
- scripts
- hooks
- binaries
- requested permissions
- network access
- credential access
- persistent execution behavior

A low-star repository is not automatically malicious.

A popular repository is not automatically safe.

Prioritize what the software executes and what permissions it receives.

---

# Trust Preference

When capabilities are otherwise equivalent, prefer approximately:

```text
Official vendor
↓
Recognized security/developer organization
↓
Established open-source project
↓
Audited smaller project
↓
Unknown source
```

Trust is one ranking factor, not a substitute for technical evaluation.

---

# Security Escalation

For security-sensitive operations such as:

- authentication
- authorization
- secrets
- payments
- file uploads
- encryption
- infrastructure
- CI/CD
- production deployment
- multi-tenant isolation

prefer an appropriate security skill when one is installed and relevant.

Do not automatically load security skills for ordinary cosmetic UI work.

---

# Routing Examples

## UI Redesign

User:

> Redesign this dashboard.

Routing:

```text
Primary: frontend-design
Secondary: none
```

Do not automatically load animation, security, backend, database, and testing skills.

## UI Animation

User:

> Make this sidebar animation premium and smooth.

Routing:

```text
Primary: ui-animation
```

Possible secondary:

```text
frontend-design
```

only if the task also requires visual redesign.

## Authentication Security

User:

> Check this login system for vulnerabilities.

Routing:

```text
Primary: security-review
```

Do not load unrelated frontend or design skills.

## Security + Fix

User:

> Find the authentication vulnerability and fix it.

Routing:

```text
1. security-review
2. debugging/code-fix
```

Do not add a third skill unless another specialized capability is genuinely required.

## Database Performance

User:

> This database query is slow.

Routing:

```text
Primary: database-performance
```

Do not load a general backend skill unless necessary.

## Unknown Capability

User:

> I need advanced Three.js animation guidance.

If no suitable skill is installed:

```text
Safe Skill Router
↓
Skill discovery
↓
Candidate review
↓
User approval
↓
Installation if approved
```

---

# Token-Efficiency Rules

Always:

1. Search before broad reading.
2. Read only relevant files.
3. Avoid rereading unchanged content.
4. Prefer concise tool output when possible.
5. Avoid repeating previous findings.
6. Do not restate large project context unnecessarily.
7. Reuse established project facts.
8. Load reference files lazily.
9. Load a skill only when its instructions are useful.
10. Keep unrelated skills unloaded when the host supports selective loading.

---

# Output Behavior

Do not normally expose every internal routing decision.

Mention routing only when useful.

Example:

```text
Using the UI animation skill for this task.
```

Security-relevant example:

```text
I found candidate tools, but they require executable third-party code, so they should be reviewed before installation.
```

Avoid verbose routing commentary when it does not help the user.

---

# Forbidden Behavior

Never:

- load all skills proactively,
- install discovered skills automatically,
- execute newly discovered third-party code automatically,
- add persistent hooks without explicit approval,
- modify global agent configuration without explicit approval,
- expose secrets to skills,
- send private repository contents to unknown external services,
- treat discovery as approval to execute software.

---

# Preferred Routing Architecture

```text
                 ┌───────────────┐
                 │   User Task   │
                 └───────┬───────┘
                         │
                         ▼
              ┌────────────────────┐
              │ Safe Skill Router  │
              └─────────┬──────────┘
                        │
               Is a skill needed?
                  ┌─────┴─────┐
                  │           │
                 No          Yes
                  │           │
                  ▼           ▼
            Execute      Check installed
            normally          │
                              ▼
                       Suitable skill?
                         ┌────┴────┐
                         │         │
                        Yes        No
                         │         │
                         ▼         ▼
                    Load 1–3    Discover
                      skills    candidates
                         │         │
                         │         ▼
                         │       Review
                         │         │
                         │         ▼
                         │    User approval
                         │         │
                         └────┬────┘
                              ▼
                           Execute
```

---

# Final Principle

The presence of a skill does not justify loading it.

Use a skill when:

```text
Expected task benefit > context cost + security risk
```

Prefer:

**minimal context, minimal privileges, minimal execution, maximum relevance.**
