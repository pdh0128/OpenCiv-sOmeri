# 테크트리 데이터 모델 (서브프로젝트 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static tech tree catalog (10 sOmeri-chronicle eras, 13 technologies with prerequisites) as server config, loaded and queryable — with zero gameplay wiring yet.

**Architecture:** Two new YAML config files (`server/config/eras.yml`, `server/config/technologies.yml`) loaded once at `InGameState.onInitialize()`, mirroring the exact pattern already used for `buildings.yml`. Two new query methods (`getEraByName`, `getTechnologyById`) mirror the existing `getBuildingDataByName`. No player-progress tracking, no gating, no socket events, no client changes — this is a pure content catalog, the same way `buildings.yml` started with just a `production_cost` field before any queue logic existed.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server only — this plan touches no client code, so there's nothing to `tsc --noEmit` check beyond the existing baseline).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-tech-tree-data-model-design.md`
- Exactly 10 eras, exactly 13 technologies — the exact table in the spec, verbatim.
- `dark_age` era has zero associated technologies — intentional (thematic regression), not a gap to fill.
- No runtime gating, no player-progress tracking, no socket events, no UI — all deferred to sub-project 2c/2d.

---

### Task 1: Era and technology config files

**Files:**
- Create: `server/config/eras.yml`
- Create: `server/config/technologies.yml`
- Test: `server/tests/unit/TechTreeConfig.test.ts`

**Interfaces:**
- Produces: `eras.yml` with top-level key `eras`, an array of 10 objects `{ id: string, name: string, order: number }` (order 1-10, no duplicates/gaps). `technologies.yml` with top-level key `technologies`, an array of 13 objects `{ id: string, name: string, era: string, prerequisites: string[] }` where every `era` value matches an `eras.yml` id and every `prerequisites` entry matches another technology's `id`. Task 2 (`InGameState.ts`) reads both files at these exact paths and top-level keys.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/TechTreeConfig.test.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('eras.yml and technologies.yml', () => {
  let eras: Record<string, any>[];
  let technologies: Record<string, any>[];

  beforeAll(() => {
    const erasPath = path.join(__dirname, '../../config/eras.yml');
    const techPath = path.join(__dirname, '../../config/technologies.yml');
    eras = YAML.parse(fs.readFileSync(erasPath, 'utf-8')).eras;
    technologies = YAML.parse(fs.readFileSync(techPath, 'utf-8')).technologies;
  });

  it('defines exactly 10 eras with sequential order 1-10', () => {
    expect(eras.length).toBe(10);
    const orders = eras.map((e) => e.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('gives every era a unique id and non-empty name', () => {
    const ids = eras.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const era of eras) {
      expect(typeof era.name).toBe('string');
      expect(era.name.length).toBeGreaterThan(0);
    }
  });

  it('defines exactly 13 technologies', () => {
    expect(technologies.length).toBe(13);
  });

  it('references only valid era ids', () => {
    const eraIds = new Set(eras.map((e) => e.id));
    for (const tech of technologies) {
      expect(eraIds.has(tech.era)).toBe(true);
    }
  });

  it('references only valid prerequisite technology ids', () => {
    const techIds = new Set(technologies.map((t) => t.id));
    for (const tech of technologies) {
      for (const prereq of tech.prerequisites) {
        expect(techIds.has(prereq)).toBe(true);
      }
    }
  });

  it('has no cycles in the prerequisite graph', () => {
    const byId = new Map(technologies.map((t) => [t.id, t]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function visit(id: string) {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Cycle detected at ${id}`);
      visiting.add(id);
      for (const prereq of byId.get(id)!.prerequisites) {
        visit(prereq);
      }
      visiting.delete(id);
      visited.add(id);
    }

    expect(() => {
      for (const tech of technologies) visit(tech.id);
    }).not.toThrow();
  });

  it('leaves dark_age with zero technologies, intentionally', () => {
    const darkAgeTechs = technologies.filter((t) => t.era === 'dark_age');
    expect(darkAgeTechs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/TechTreeConfig.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../server/config/eras.yml'`

- [ ] **Step 3: Create `server/config/eras.yml`**

```yaml
eras:
  - id: chaos
    name: 혼돈시대
    order: 1
  - id: founding
    name: 건국시대
    order: 2
  - id: unification
    name: 통일시대
    order: 3
  - id: great_empire
    name: 대제국시대
    order: 4
  - id: golden_age
    name: 황금시대
    order: 5
  - id: dark_age
    name: 암흑시대
    order: 6
  - id: restoration
    name: 중흥시대
    order: 7
  - id: enlightenment
    name: 계몽시대
    order: 8
  - id: industrial
    name: 산업혁명시대
    order: 9
  - id: modern
    name: 현대·우주시대
    order: 10
```

- [ ] **Step 4: Create `server/config/technologies.yml`**

```yaml
technologies:
  - id: irrigation
    name: 관개농법
    era: chaos
    prerequisites: []
  - id: writing
    name: sOmeri 문자
    era: founding
    prerequisites: [irrigation]
  - id: currency
    name: 표준 화폐
    era: founding
    prerequisites: [irrigation]
  - id: administration
    name: 호적·도량형
    era: unification
    prerequisites: [writing]
  - id: seafaring
    name: 원양 항해
    era: unification
    prerequisites: [currency]
  - id: philosophy
    name: 문명신앙
    era: great_empire
    prerequisites: [administration]
  - id: masonry
    name: 왕도 건설
    era: great_empire
    prerequisites: [seafaring]
  - id: banking
    name: 신용 거래
    era: golden_age
    prerequisites: [philosophy, masonry]
  - id: education
    name: 의무교육
    era: restoration
    prerequisites: [banking]
  - id: scientific_method
    name: 과학혁명
    era: enlightenment
    prerequisites: [education]
  - id: industrialization
    name: 산업화
    era: industrial
    prerequisites: [scientific_method]
  - id: electricity
    name: 전신·통신
    era: industrial
    prerequisites: [industrialization]
  - id: computing
    name: 정보공학
    era: modern
    prerequisites: [electricity]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/TechTreeConfig.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add server/config/eras.yml server/config/technologies.yml server/tests/unit/TechTreeConfig.test.ts
git commit -m "Config: Add sOmeri eras and tech tree data"
```

---

### Task 2: `InGameState` — load and expose the catalog

**Files:**
- Modify: `server/src/state/type/InGameState.ts`

**Interfaces:**
- Consumes: `server/config/eras.yml` (top-level key `eras`) and `server/config/technologies.yml` (top-level key `technologies`) from Task 1.
- Produces: `InGameState.getEraByName(id: string): Record<string, any> | undefined`, `InGameState.getTechnologyById(id: string): Record<string, any> | undefined`. No later task in this plan consumes these — they exist for sub-project 2c to call.

There is no existing test file for `InGameState.ts` (established precedent from the prior plan's Task 3 — `getBuildingDataByName` is likewise untested there). This task follows that same precedent; verification is the full test suite (no regressions) plus a manual read-through.

- [ ] **Step 1: Add the two new fields**

Replace line 18:
```typescript
  private cityBuildings: Record<string, any>[];
```
with:
```typescript
  private cityBuildings: Record<string, any>[];
  private eras: Record<string, any>[];
  private technologies: Record<string, any>[];
```

- [ ] **Step 2: Load the two new config files**

Replace lines 25-28:
```typescript
    // Load available buildings from config file
    const buildingsYMLData = YAML.parse(fs.readFileSync("./config/buildings.yml", "utf-8"));
    //Convert civsData from YAML to JSON:
    this.cityBuildings = JSON.parse(JSON.stringify(buildingsYMLData.buildings));
```
with:
```typescript
    // Load available buildings from config file
    const buildingsYMLData = YAML.parse(fs.readFileSync("./config/buildings.yml", "utf-8"));
    //Convert civsData from YAML to JSON:
    this.cityBuildings = JSON.parse(JSON.stringify(buildingsYMLData.buildings));

    // Load eras and technologies from config files
    const erasYMLData = YAML.parse(fs.readFileSync("./config/eras.yml", "utf-8"));
    this.eras = JSON.parse(JSON.stringify(erasYMLData.eras));

    const technologiesYMLData = YAML.parse(fs.readFileSync("./config/technologies.yml", "utf-8"));
    this.technologies = JSON.parse(JSON.stringify(technologiesYMLData.technologies));
```

- [ ] **Step 3: Add the two query methods**

Replace lines 185-193 (the `getBuildingDataByName` method):
```typescript
  public getBuildingDataByName(name: string) {
    for (const building of this.cityBuildings) {
      if ((building.name as string).toLocaleLowerCase() === name.toLocaleLowerCase()) {
        return building;
      }
    }

    return undefined;
  }
```
with:
```typescript
  public getBuildingDataByName(name: string) {
    for (const building of this.cityBuildings) {
      if ((building.name as string).toLocaleLowerCase() === name.toLocaleLowerCase()) {
        return building;
      }
    }

    return undefined;
  }

  public getEraByName(id: string) {
    for (const era of this.eras) {
      if (era.id === id) {
        return era;
      }
    }

    return undefined;
  }

  public getTechnologyById(id: string) {
    for (const technology of this.technologies) {
      if (technology.id === id) {
        return technology;
      }
    }

    return undefined;
  }
```

- [ ] **Step 4: Verify the server still type-checks and the existing suite still passes**

Run: `cd server && npm run test`
Expected: Same pass/fail counts as before this task (this change adds no new test file) — no new failures beyond the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 5: Commit**

```bash
git add server/src/state/type/InGameState.ts
git commit -m "Server: Load sOmeri eras and tech tree in InGameState"
```

---

### Task 3: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-2 integrate correctly.

This plan touches zero client code and adds zero player-facing behavior (no socket events, no UI), so there is nothing new to verify in a live browser — the regression surface is entirely the server test suite.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm run test`
Expected: All suites pass, including `TechTreeConfig.test.ts` (new), plus every previously-passing suite (`BuildingsConfig.test.ts`, `City.test.ts`, `ProvincesConfig.test.ts`, `Player.test.ts`, `LobbyState.test.ts`, `GameMap.test.ts`). The only failures should be the pre-existing, unrelated `Unit.test.ts` failures (`mockPlayer.addUnit is not a function`) that predate this plan.

- [ ] **Step 2: Run the client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors (this plan touched no client files, so this is a pure regression guard).

- [ ] **Step 3: Commit (only if Step 1-2 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in tech tree data model check"
```
If no fixes were needed, skip this step — there is nothing to commit.
