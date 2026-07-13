// server/tests/unit/GovernmentBranchesConfig.test.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('government_branches.yml', () => {
  let branches: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/government_branches.yml');
    branches = YAML.parse(fs.readFileSync(filePath, 'utf-8')).government_branches;
  });

  it('defines exactly 3 government branches', () => {
    expect(branches.length).toBe(3);
  });

  it('gives every branch a unique id and a positive bonus_percent', () => {
    const ids = branches.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const branch of branches) {
      expect(typeof branch.name).toBe('string');
      expect(typeof branch.stat).toBe('string');
      expect(branch.bonus_percent).toBeGreaterThan(0);
    }
  });

  it('covers three distinct stats: culture, production, science', () => {
    const stats = new Set(branches.map((b) => b.stat));
    expect(stats).toEqual(new Set(['culture', 'production', 'science']));
  });
});
