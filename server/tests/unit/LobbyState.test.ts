// server/tests/unit/LobbyState.test.ts
import { LobbyState } from '../../src/state/type/LobbyState';

jest.mock('../../src/Events');
jest.mock('../../src/Game');

describe('LobbyState', () => {
  let lobbyState: LobbyState;
  const provinceA = { name: '소메르 강 유역', icon_name: 'ROME_ICON' };
  const provinceB = { name: '해안 자치주', icon_name: 'MAMLUKS_ICON' };

  beforeEach(() => {
    lobbyState = Object.create(LobbyState.prototype);
    (lobbyState as any).playableProvinces = [provinceA, provinceB];
  });

  it('getProvinceByName finds a province by exact name', () => {
    expect(lobbyState.getProvinceByName('해안 자치주')).toBe(provinceB);
  });

  it('getProvinceByName returns undefined for an unknown name', () => {
    expect(lobbyState.getProvinceByName('없는 광역주')).toBeUndefined();
  });
});
