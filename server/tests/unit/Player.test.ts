import { WebSocket } from 'ws';
import { Player } from '../../src/Player';
import { Game } from '../../src/Game';

jest.mock('../../src/Events');
jest.mock('../../src/Game', () => ({
  Game: { getInstance: () => ({ getPlayers: () => new Map() }) }
}));

function fakeWebSocket(): jest.Mocked<WebSocket> {
  return { on: jest.fn(), send: jest.fn() } as unknown as jest.Mocked<WebSocket>;
}

const fakeProvince = {
  name: '해안 자치주',
  icon_name: 'MAMLUKS_ICON',
  cities: ['항구성', '교역', '자치항']
};

describe('Player', () => {
  it('stores and returns province data', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getProvinceData()).toBe(fakeProvince);
  });

  it('serializes provinceData under the "provinceData" key in toJSON', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    const json = player.toJSON();
    expect(json).toEqual({
      name: 'Player1',
      provinceData: fakeProvince,
      requestedNextTurn: false
    });
  });

  it('returns the first unused city name from the province pool', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getNextAvailableCityName()).toBe('항구성');
  });

  it('skips city names already taken by this player\'s existing cities', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = [{ getName: () => '항구성' }, { getName: () => '교역' }];
    expect(player.getNextAvailableCityName()).toBe('자치항');
  });

  it('returns MAX_CITIES_REACHED once every pool name is used', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = fakeProvince.cities.map((name) => ({ getName: () => name }));
    expect(player.getNextAvailableCityName()).toBe('MAX_CITIES_REACHED');
  });
});

describe('Player research queue', () => {
  const irrigationData = { id: 'irrigation', name: '관개농법', era: 'chaos', prerequisites: [], research_cost: 5 };
  const writingData = { id: 'writing', name: 'sOmeri 문자', era: 'founding', prerequisites: ['irrigation'], research_cost: 8 };

  let getTechnologyById: jest.Mock;

  beforeEach(() => {
    getTechnologyById = jest.fn().mockImplementation((id: string) => {
      if (id === 'irrigation') return irrigationData;
      if (id === 'writing') return writingData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getTechnologyById })
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queueResearch sets currentResearch for a valid tech with satisfied prerequisites', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation');
    expect(player.getCurrentResearch()).toBe('irrigation');
  });

  it('queueResearch ignores an unknown technology id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('nonexistent');
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('queueResearch ignores a technology whose prerequisites are not yet researched', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('writing'); // requires irrigation, not yet researched
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('queueResearch ignores an already-researched technology', () => {
    const player = new Player('Player1', fakeWebSocket());
    (player as any).researchedTechs.add('irrigation');
    player.queueResearch('irrigation');
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('processResearchTurn accumulates progress from all cities without completing below cost', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation'); // cost 5
    (player as any).cities = [
      { getStatline: () => ({ science: 2 }) },
      { getStatline: () => ({ science: 1 }) }
    ];

    player.processResearchTurn();

    expect(player.getResearchProgress()).toBe(3);
    expect(player.getCurrentResearch()).toBe('irrigation');
    expect(player.hasResearchedTech('irrigation')).toBe(false);
  });

  it('processResearchTurn completes the technology once cost is reached, carrying overflow', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation'); // cost 5
    (player as any).cities = [{ getStatline: () => ({ science: 4 }) }];

    player.processResearchTurn(); // progress 4, below cost
    player.processResearchTurn(); // progress 8 >= 5 -> completes, overflow 3

    expect(player.hasResearchedTech('irrigation')).toBe(true);
    expect(player.getCurrentResearch()).toBeUndefined();
    expect(player.getResearchProgress()).toBe(3);
  });

  it('processResearchTurn does nothing when nothing is queued', () => {
    const player = new Player('Player1', fakeWebSocket());
    (player as any).cities = [{ getStatline: () => ({ science: 10 }) }];

    player.processResearchTurn();

    expect(player.getResearchProgress()).toBe(0);
  });
});
