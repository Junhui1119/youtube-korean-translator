---
name: musk-skill
description: Use when the user asks to apply Musk-style first-principles reasoning to requirements, architecture, or GitHub issue creation, especially with MVP scope, future sub-issues, document review, human approval gates, or no-docs-yet constraints.
---

# Musk Skill

## Core Principle

Reduce the request to first principles before creating any GitHub issue.

Do not start from old plans, existing categories, analogies, or "usually this is how it works". Start from:

- What concrete problem exists now?
- What facts are already true in the current system?
- What is the smallest reversible change that solves the current problem?
- What can be removed without breaking the MVP?
- What belongs in future work?

## Hard Rules

1. Discuss first. Do not write repo docs/specs/current/todo files in this workflow unless the user explicitly asks.
2. The parent issue must contain only decided MVP scope.
3. Do not leave `待确认`, `TBD`, `maybe`, speculative planning, or unresolved questions in the parent issue.
4. Non-future MVP issues get the `good first issue` label.
5. Future or expandable scope becomes sub-issue and gets the repo future label.
6. Run document review before creating GitHub issues.
7. After document review, present the reviewed draft to the user for an explicit human gate.
8. Create GitHub issues only after the user approves.
9. Use GitHub native parent/sub-issue relationships when sub-issues are created.

## First-Principles Filter

Apply this filter to every proposed requirement:

| Question | Action |
|---|---|
| Does removing this make the MVP fail? | If no, move it to future scope. |
| Is this forced by current system facts? | If no, challenge it. |
| Is this irreversible or expensive to change later? | If yes, state the decision clearly. |
| Is there a smaller placeholder that keeps future options open? | Prefer the smaller placeholder. |
| Is this copied from convention instead of derived from the problem? | Remove it or justify it from facts. |

## Workflow

### 1. Gather Current Facts

Read repo instructions first:

- `docs/AGENT_INSTRUCTIONS.md`
- `docs/GITHUB_ISSUES.md` when creating parent/sub-issues
- relevant `docs/current/*.md`
- relevant source files only when needed to verify current facts

Do not write repository documents during fact gathering.

### 2. Discuss MVP In Chat

Keep the first pass in the conversation. Use this shape:

```markdown
## 真实问题
...

## 底层事实
...

## MVP 闭环
...

## 非目标
...

## Future 停车场
...
```

If a requirement cannot pass the first-principles filter, put it in `Future 停车场`.

### 3. Draft Issue Bodies

Draft parent and future sub-issue bodies before touching GitHub.

The parent issue is a committed MVP. It includes:

- background
- first-principles scope
- MVP behavior
- frontend behavior if relevant
- backend/API behavior if relevant
- non-goals
- acceptance criteria

Future sub-issues include:

- future scope
- non-goals
- parent linkage
- future label requirement

Label rules:

- Parent MVP issue / non-future issue: `good first issue`
- Future sub-issue: repo future label, usually `Future`

Temporary files in `/private/tmp` are allowed only after the user approves creating issues, for `gh issue create --body-file`.

### 4. Document Review Gate

Before submitting GitHub issues, run document review using the superpowers spec-document-reviewer rubric.

If subagents are available, dispatch a spec document reviewer. If subagents are unavailable, perform the same review directly and say that subagent review was unavailable.

Review checklist:

| Category | What to Check |
|---|---|
| Completeness | TODOs, placeholders, missing sections |
| Consistency | internal contradictions |
| Clarity | ambiguity that could cause wrong implementation |
| Scope | parent issue focused on one MVP |
| YAGNI | unrequested features or over-engineering |

Reviewer output:

```markdown
## Document Review

**Status:** Approved | Issues Found

**Issues:**
- ...

**Recommendations:**
- ...
```

Only block on issues that would cause real implementation or planning problems.

### 5. Human Gate

After document review, show the user:

- parent issue title
- parent issue label: `good first issue`
- sub-issue titles
- future sub-issue label: repo future label
- document review status
- blocking issues fixed, if any
- final issue bodies or concise summaries

Ask for explicit approval before creating GitHub issues. Do not create issues until the user approves.

### 6. Create GitHub Issues

Create parent issue:

```bash
gh issue create --repo OWNER/REPO --title "[需求] ..." --body-file /private/tmp/parent.md --label "good first issue"
```

Create future sub-issue:

```bash
gh issue create --repo OWNER/REPO --title "[Future] ..." --body-file /private/tmp/future.md --label Future
```

Use the existing repo future label casing. Do not invent a new label if one already exists.

### 7. Attach Native Sub-Issue

Fetch IDs:

```bash
gh api graphql -f query='query {
  repository(owner:"OWNER", name:"REPO") {
    parent: issue(number:PARENT) { id number title url }
    sub: issue(number:SUB) { id number title url }
  }
}'
```

Attach:

```bash
gh api graphql -f query='mutation {
  addSubIssue(input:{
    issueId:"PARENT_ID",
    subIssueId:"SUB_ID",
    replaceParent:true
  }) {
    issue { number title }
    subIssue { number title }
  }
}'
```

Verify:

```bash
gh api graphql -f query='query {
  repository(owner:"OWNER", name:"REPO") {
    parent: issue(number:PARENT) {
      number
      title
      labels(first:10) { nodes { name } }
      subIssues(first:20) {
        nodes {
          number
          title
          labels(first:10) { nodes { name } }
        }
      }
    }
    sub: issue(number:SUB) {
      number
      title
      parent { number title }
      labels(first:10) { nodes { name } }
    }
  }
}'
```

## Parent Issue Template

```markdown
# 需求：<MVP title>

## 背景
...

## 第一性原理范围

### 真实问题
...

### 底层事实
- ...

### MVP 闭环
1. ...

## API 命名规则
- ...

## 前端行为
- ...

## 后端行为
- ...

## 非目标
- ...

## Future Sub-Issue
- #<sub> ...

## 验收标准
- ...
```

## Future Sub-Issue Template

```markdown
# Future：<title>

关联总需求：#<parent>

## 背景
...

## Future 范围
- ...

## 非目标
- ...
```

## Red Flags

Stop and correct the draft if any of these appear:

- The answer says "first principles" but does not state `真实问题 / 底层事实 / MVP 闭环 / 非目标`.
- The parent issue contains unresolved questions.
- Future planning appears inside parent acceptance criteria.
- The parent MVP issue is missing `good first issue`.
- The future sub-issue is missing the repo future label.
- GitHub issues are created before document review.
- GitHub issues are created before explicit human approval.
- Sub-issues are only linked in text and not attached with GitHub native sub-issue relationship.
- The agent writes repo docs/specs even though the workflow is still in discussion.

## Common Mistakes

- Creating issues before discussion.
- Treating convention as a bottom fact.
- Hiding a future roadmap inside the MVP.
- Inventing a future label when the repo already has one.
- Renaming API namespaces against user instruction.
- Skipping verification after creating issues.
