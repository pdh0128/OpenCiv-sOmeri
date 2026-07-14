import { WebSocket } from 'ws';
import { Player } from '../../src/Player';
import { Game } from '../../src/Game';
import { ServerEvents } from '../../src/Events';

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
      requestedNextTurn: false,
      idealPoints: { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 }
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

describe('Player government branch', () => {
  const senateData = { id: 'senate', name: '원로원', stat: 'culture', bonus_percent: 20 };
  const assemblyData = { id: 'assembly', name: '국민의회', stat: 'production', bonus_percent: 20 };

  let getGovernmentBranchById: jest.Mock;

  beforeEach(() => {
    getGovernmentBranchById = jest.fn().mockImplementation((id: string) => {
      if (id === 'senate') return senateData;
      if (id === 'assembly') return assemblyData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getGovernmentBranchById })
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selectGovernmentBranch sets the branch for a valid id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');
    expect(player.getSelectedGovernmentBranch()).toBe('senate');
  });

  it('selectGovernmentBranch ignores an unknown branch id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('nonexistent');
    expect(player.getSelectedGovernmentBranch()).toBeUndefined();
  });

  it('selectGovernmentBranch allows switching directly between branches, no queue', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');
    player.selectGovernmentBranch('assembly');
    expect(player.getSelectedGovernmentBranch()).toBe('assembly');
  });
});

describe('Player ideal points', () => {
  it('starts every ideal at 0', () => {
    const player = new Player('Player1', fakeWebSocket());
    expect(player.getIdealPoints()).toEqual({
      unity: 0,
      knowledge: 0,
      development: 0,
      order: 0,
      pioneering: 0
    });
  });

  it('awardIdealPoints adds to the named ideal without touching others', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 10);
    player.awardIdealPoints('unity', 5);

    expect(player.getIdealPoints().unity).toBe(15);
    expect(player.getIdealPoints().knowledge).toBe(0);
  });

  it('toJSON includes the current idealPoints', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('pioneering', 5);

    expect(player.toJSON().idealPoints).toEqual({
      unity: 0,
      knowledge: 0,
      development: 0,
      order: 0,
      pioneering: 5
    });
  });

  it('processResearchTurn awards knowledge points when a technology completes', () => {
    const player = new Player('Player1', fakeWebSocket());
    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getTechnologyById: jest.fn().mockReturnValue({ id: 'irrigation', prerequisites: [], research_cost: 5 })
      })
    } as any);
    player.queueResearch('irrigation');
    (player as any).cities = [{ getStatline: () => ({ science: 5 }) }];

    player.processResearchTurn();

    expect(player.getIdealPoints().knowledge).toBe(15);

    jest.restoreAllMocks();
  });

  it('processResearchTurn does not award knowledge points when nothing completes', () => {
    const player = new Player('Player1', fakeWebSocket());
    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getTechnologyById: jest.fn().mockReturnValue({ id: 'irrigation', prerequisites: [], research_cost: 100 })
      })
    } as any);
    player.queueResearch('irrigation');
    (player as any).cities = [{ getStatline: () => ({ science: 1 }) }];

    player.processResearchTurn();

    expect(player.getIdealPoints().knowledge).toBe(0);

    jest.restoreAllMocks();
  });
});

describe('Player order points from government stability', () => {
  const senateData = { id: 'senate', name: '원로원', stat: 'culture', bonus_percent: 20 };

  const storedCallbacks: Record<string, Function[]> = {};

  beforeEach(() => {
    storedCallbacks['nextTurn'] = [];

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getGovernmentBranchById: jest.fn().mockReturnValue(senateData)
      })
    } as any);

    jest.spyOn(ServerEvents, 'on').mockImplementation((options: any) => {
      if (!storedCallbacks[options.eventName]) {
        storedCallbacks[options.eventName] = [];
      }
      storedCallbacks[options.eventName].push(options.callback);
    });

    jest.spyOn(ServerEvents, 'call').mockImplementation((eventName: string, data: any) => {
      for (const callback of storedCallbacks[eventName] ?? []) {
        callback(data);
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('awards no order points on the first turn a branch is selected', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');

    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(0);
  });

  it('awards order points on a second consecutive turn with the same branch', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');

    ServerEvents.call('nextTurn', {});
    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(2);
  });

  it('awards no order points when no branch is selected', () => {
    const player = new Player('Player1', fakeWebSocket());

    ServerEvents.call('nextTurn', {});
    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(0);
  });
});
