/// <reference path="../declarations/TemporaryScriptTypes.d.ts" />
/// <reference path="../declarations/DataStore/BadgeCase.d.ts" />
/// <reference path="../declarations/party/Category.d.ts"/>

class App {

    static readonly debug = false;
    static game: Game;
    static readonly isUsingClient = true || (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0);
    static translation = new Translate(Settings.getSetting('translation.language'));

    static start() {
        // Hide tooltips that stay on game load
        $('.tooltip').tooltip('hide');

        if (!App.debug) {
            Object.freeze(GameConstants);
        }

        Preload.load(App.debug).then(() => {
            ko.options.deferUpdates = true;

            console.log(`[${GameConstants.formatDate(new Date())}] %cLoading Game Data..`, 'color:#8e44ad;font-weight:900;');

            App.game = new Game();

            console.log(`[${GameConstants.formatDate(new Date())}] %cGame loaded`, 'color:#2ecc71;font-weight:900;');
            Notifier.notify({ message: 'Game loaded', type: NotificationConstants.NotificationOption.info });

            console.log(`[${GameConstants.formatDate(new Date())}] %cStarting game..`, 'color:#8e44ad;font-weight:900;');

            GameController.bindToolTips();
            GameController.addKeyListeners();

            App.game.initialize();
            GameLoadState.updateLoadState(GameLoadState.states.initialized);

            // Fix any settings that conflict with the now-loaded game data
            Settings.checkAndFix();

            // Fixes custom theme css if Default theme was different from save theme (must be done before bindings)
            document.body.className = 'no-select';
            ko.applyBindings(App.game);
            GameLoadState.updateLoadState(GameLoadState.states.appliedBindings);

            Preload.hideSplashScreen();

            App.game.start();
            GameLoadState.updateLoadState(GameLoadState.states.running);

            // Check if Mobile and deliver a warning around mobile compatability / performance issues
            const isMobile: boolean = /Mobile/.test(navigator.userAgent);
            const isTouchDevice: boolean = 'ontouchstart' in document.documentElement;
            const hasSeenWarning: string = localStorage.getItem('hasSeenMobileWarning');
            if (isMobile && isTouchDevice && hasSeenWarning != 'true') {
                Notifier.warning({
                    title: 'Mobile Device Detected',
                    message: 'Please Note: \n\nYou may experience performance issues playing on mobile, especially on older models. \n\nWhile it is ' +
                        'possible to play on a phone or tablet, please be aware that the controls and features are designed with a mouse and keyboard in ' +
                        'mind and may not work as well on a mobile device. \n\nFor the best gameplay experience we highly recommend playing on a PC ' +
                        'browser or our desktop client by <b><a href="https://github.com/RedSparr0w/Pokeclicker-desktop/releases/latest" target="_blank">downloading here</a>' +
                        '\n\nThank You!',
                }).then((result: boolean) => {
                    if (result) {
                        localStorage.setItem('hasSeenMobileWarning', 'true');
                    }
                });
            }

        });
    }
}

App satisfies TmpAppType;

// Personal Functions
const MissingMonoTypes = function (type: PokemonType): PokemonNameType[] {
    const myself = player as Player;
    return pokemonList.filter(p =>
        p.id > 0 &&
        (p.type[0] == type || p.type[1] == type) &&
        PokemonHelper.calcNativeRegion(p.name) <= myself.highestRegion() &&
        PartyController.getCaughtStatusByName(p.name) == CaughtStatus.NotCaught
    ).map(p => p.name);
};

const SafariZones = function (region: GameConstants.Region): string {
    return (SafariItemController.list[region] as SafariItemWeighed[])
        .filter(v => ItemList[v.item.id] instanceof PokemonItem)
        .map(v => PokemonHelper.getPokemonByName(ItemList[v.item.id].name as PokemonNameType))
        .filter(v => v.id != 0)
        .map(v => PokemonHelper.displayName(v.name)())
        .concat(
            (SafariPokemonList.list[region] as KnockoutObservable<SafariEncounter[]>)()
                .filter(v => !(v.requirement instanceof ObtainedPokemonRequirement))
                .map(v => PokemonHelper.displayName(v.name)())
        )
        .join(' <-> ');
};

const FarmWanderInfo = function (): string {
    const result: (string[])[] = [];
    const region = [
        /*Kanto*/ [],
        /*Jotho*/ [BerryType.Chople, BerryType.Kebia, BerryType.Shuca, BerryType.Charti, BerryType.Babiri, BerryType.Chilan, BerryType.Petaya], //#5484 -> []
        /*Hoenn*/ [BerryType.Pinkan, BerryType.Kee, BerryType.Maranga, BerryType.Liechi, BerryType.Ganlon, BerryType.Salac, BerryType.Enigma],
        /*Sinnoh*/ [BerryType.Apicot, BerryType.Lansat, BerryType.Snover],
        /*Unova*/ [],
        /*Kalos*/ [],
        /*Alola*/ [],
        /*Galar*/ [],
        /*Hisui*/ [BerryType.Hopo],
        /*Paldea*/ [],
    ];

    App.game.farming.berryData.forEach(v => !region.flat().includes(v.type) ? region[0].push(v.type) : null);
    region.forEach(() => result.push([]));

    const temp = App.game.farming.berryData.flatMap(v => v.wander.map(w => [w, region.flatMap((a, b) => a.includes(v.type) ? b : -1).filter(i => i >= 0)[0]]));
    [...new Set(temp.map(v => v[0] as PokemonNameType))]
        .map(v => [v, Math.max(Math.min(...temp.map(w => w[0] === v ? w[1] as number : -1).filter(j => j >= 0)), PokemonHelper.calcNativeRegion(v))])
        .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
        .forEach(v => result[v[1] as number].push(PokemonHelper.displayName(v[0] as PokemonNameType)));
    return JSON.stringify(result);
};

const EvoItems = function (): string {
    const farmableCurrency: Array<GameConstants.Currency> = [];
    farmableCurrency.push(GameConstants.Currency.money);
    // farmableCurrency.push(GameConstants.Currency.questPoint); // Not AFK farmable
    farmableCurrency.push(GameConstants.Currency.dungeonToken);
    farmableCurrency.push(GameConstants.Currency.diamond);
    farmableCurrency.push(GameConstants.Currency.farmPoint);
    farmableCurrency.push(GameConstants.Currency.battlePoint);
    // farmableCurrency.push(GameConstants.Currency.contestToken); // Not AFK farmable yet

    const all: Set<Item> = new Set();
    const underground: Set<UndergroundItem> = new Set();
    const heldItems: Set<string> = new Set();
    Object.keys(ItemList).forEach(v => {
        if ( ItemList[v] instanceof EvolutionStone && !farmableCurrency.includes(ItemList[v].currency) ) {
            all.add(ItemList[v]);
        }
    });
    UndergroundItems.list.forEach(v => {
        if ( v.valueType === UndergroundItemValueType.EvolutionItem ) {
            underground.add(v);
        }
    });
    pokemonList.forEach(v => {
        if ( v.hasOwnProperty('heldItem') ) {
            if ( PokemonHelper.getPokemonByName(v.name).heldItem?.type === ItemType.item ) {
                heldItems.add(PokemonHelper.getPokemonByName(v.name).heldItem?.id as string);
            }
        }
    });
    underground.forEach(v => {
        all.forEach(w => {
            if ( w.name.toLowerCase() === (v.name).replace(' ','_').toLowerCase() ) {
                all.delete(w);
            }
        });
    });
    heldItems.forEach(v => {
        all.forEach(w => {
            if ( w.name.toLowerCase() === v.toLowerCase() ) {
                all.delete(w);
            }
        });
    });
    const out: string[] = [];
    all.forEach(v => out.push(v.name));

    return JSON.stringify(out);
};

const TypedEggInfo = function (): string {
    const x =
        [
            App.game.breeding.hatchList[GameConstants.EggItemType.Mystery_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Fire_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Water_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Grass_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Fighting_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Electric_egg],
            App.game.breeding.hatchList[GameConstants.EggItemType.Dragon_egg],
        ].map(x => x.map(v => v.map(w => PokemonHelper.displayName(w))));
    return JSON.stringify(x);
};

const RemoveEvent = function (req: Requirement | undefined): boolean {
    if ( req instanceof MultiRequirement ) {
        return req.requirements.some(v => RemoveEvent(v));
    }
    if ( req instanceof OneFromManyRequirement ) {
        return req.requirements.every(v => RemoveEvent(v));
    }
    if (
        req instanceof SpecialEventRequirement ||
        (req instanceof PokemonLevelRequirement && req.option == GameConstants.AchievementOption.less)
    ) {
        return true;
    }
    return false;
};

const RoutesInfo = function (region: GameConstants.Region): string {
    const result = Routes.getRoutesByRegion(region).sort((a, b) => a.number - b.number)
        .map(x => [
            x.routeName,
            x.pokemon.land.concat(x.pokemon.water, x.pokemon.headbutt, ...x.pokemon.special.map(p => (!RemoveEvent(p.req) ? p.pokemon : []) ) ).map(v => PokemonHelper.displayName(v)),
        ]);
    Routes.getRoutesByRegion(region).forEach(v => {
        v.pokemon.special.forEach(w => {
            if ( !(w.req instanceof WeatherRequirement) && !(w.req instanceof SpecialEventRequirement) && !(w.req instanceof MoonCyclePhaseRequirement) ) {
                console.log(`${v.routeName} - ${w.pokemon}`);
            }
        });
    });
    return JSON.stringify(result);
};

const DungeonsInfo = function (region: GameConstants.Region): string {
    const result = GameConstants.RegionDungeons[region]
        .map(k => [
            k,
            [dungeonList[k].enemyList, dungeonList[k].bossList].flat().filter(v => !(v instanceof DungeonTrainer))
                .map(v => v instanceof DungeonBossPokemon ? (!RemoveEvent(v.options?.requirement) ? v.name : []) : v).flat()
                .map(v => v.hasOwnProperty('options') ? (!RemoveEvent((v as DetailedPokemon).options.requirement) ? (v as DetailedPokemon).pokemon : []) : v).flat()
                .map(v => PokemonHelper.displayName(v as PokemonNameType)),
            Object.entries(dungeonList[k].lootTable).map(([_, v]) => v).flat().filter(v => pokemonMap[v.loot].id).map(v => !RemoveEvent(v.requirement) ? v.loot : []).flat(),
        ]);
    GameConstants.RegionDungeons[region].forEach(w => {
        dungeonList[w].bossList.forEach(v => {
            if ( v instanceof DungeonBossPokemon && PokemonHelper.calcNativeRegion(v.name) === region ) {
                if ( v.options ) {
                    console.log(`${w} - Boss: ${v.name}`);
                }
            }
        });
        dungeonList[w].enemyList.forEach(v => {
            if ( !(typeof v === 'string') && !(v instanceof DungeonTrainer) && PokemonHelper.calcNativeRegion(v.pokemon) === region ) {
                if ( v.options ) {
                    if ( v.options.requirement ) {
                        console.log(`${w} - Enemy: ${v.pokemon}`);
                    }
                }
            }
        });
    });
    return JSON.stringify(result);
};

const OrderRequirements = function (req: Requirement, ending: boolean): string {
    const dungeons = GameConstants.RegionDungeons.flat();
    let temp = '';

    if ( req.option === GameConstants.AchievementOption.less ) {
        console.log(req);
        if (
            req instanceof GymBadgeRequirement ||
            req instanceof QuestLineStepCompletedRequirement ||
            req instanceof TemporaryBattleRequirement
        ) {
            return temp;
        }
    }

    if ( req instanceof RouteKillRequirement ) {
        temp += Routes.getRoute(req.region, req.route).routeName;
    } else if ( req instanceof GymBadgeRequirement ) {
        temp += `${BadgeEnums[req.badge]} Badge`;
    } else if ( req instanceof ClearDungeonRequirement ) {
        temp += dungeons[req.dungeonIndex];
    } else if ( req instanceof TemporaryBattleRequirement ) {
        temp += req.battleName;
    } else if ( req instanceof QuestLineStepCompletedRequirement ) {
        temp += `[Q] ${req.questLineName} Step ${req.questIndex}`;
    } else if ( req instanceof QuestLineStartedRequirement ) {
        temp += `[Q] ${req.questLineName} START`;
    } else if ( req instanceof QuestLineCompletedRequirement ) {
        temp += `[Q] ${req.questLineName} END`;
    } else if ( req instanceof SpecialEventRequirement ) {
        temp += 'Event Calendar';
    } else if ( req instanceof MultiRequirement ) {
        temp += '(';
        req.requirements.forEach((v, i) => {
            temp += OrderRequirements(v, false);
            if ( i + 1 < req.requirements.length ) {
                temp += ' AND ';
            }
        });
        temp += ')';
    } else if ( req instanceof OneFromManyRequirement ) {
        temp += '(';
        req.requirements.forEach((v, i) => {
            temp += OrderRequirements(v, false);
            if ( i + 1 < req.requirements.length ) {
                temp += ' OR ';
            }
        });
        temp += ')';
    } else if ( req instanceof CustomRequirement ) {
        console.log('CustomRequirement');
        console.log(req);
        console.log('----------');
    // These Requirements is only on stuff not yet intended to play with
    } else if ( req instanceof NullRequirement ) {
        temp += 'NULL';
    } else if ( req instanceof DevelopmentRequirement ) {
        if ( req.requirement ) {
            temp += OrderRequirements(req.requirement, true);
        }
        temp += 'NULL';
    // These Requirements are location independent and thus not needed to include.
    } else if (
        req instanceof WeatherRequirement ||
        req instanceof SeededDateSelectNRequirement ||
        req instanceof StatisticRequirement ||
        req instanceof DayCyclePartRequirement ||
        req instanceof ItemOwnedRequirement ||
        req instanceof ObtainedPokemonRequirement ||
        req instanceof ClearGymRequirement
    ) {} else {
        console.log('Requirement not included');
        console.log(req);
        console.log('----------');
    }


    if ( ending ) {
        temp += '|';
    }
    return temp;
};

const RouteOrder = function (region: GameConstants.Region): string {
    let temp = '';
    Routes.getRoutesByRegion(region).sort((a,b) => a.number - b.number).forEach(w => {
        temp += `${w.routeName}|`;
        w.requirements.forEach(v => {
            temp += OrderRequirements(v, true);
        });
        temp += '<<';
    });
    return temp;
};

const DungeonOrder = function (region: GameConstants.Region): string {
    let temp = '';
    GameConstants.RegionDungeons[region].forEach(w => {
        temp += `${w}|`;
        if ( TownList[w].dungeon?.optionalParameters.requirement ) {
            temp += OrderRequirements(TownList[w].dungeon.optionalParameters.requirement, true);
        }
        TownList[w].requirements.forEach(v => {
            temp += OrderRequirements(v, true);
        });
        const rew = String(TownList[w].dungeon?.rewardFunction);
        if ( rew != '() => { }' ) {
            if ( rew.search('DungeonGainGymBadge') >= 0 ) {
                temp += `${eval(`BadgeEnums[${rew.substring(rew.search('GymList')).replace(')','.badgeReward')}]`)} Badge|`;
            }
        }
        temp += '<<';
    });
    return temp;
};

const BadgeOrder = function (): string {
    let temp = '';
    GameConstants.RegionGyms.flat().sort((a,b) => GymList[a].badgeReward - GymList[b].badgeReward).forEach(w => {
        temp += `${BadgeEnums[GymList[w].badgeReward]} Badge|`;
        GymList[w].requirements.forEach(v => {
            temp += OrderRequirements(v, true);
        });
        if ( GymList[w].hasOwnProperty('parent') ) {
            GymList[w].parent.requirements.forEach(v => {
                temp += OrderRequirements(v, true);
            });
        }
        temp += '<<';
    });
    return temp;
};

const TemporaryBattleOrder = function (): string {
    let temp = '';
    Object.keys(TemporaryBattleList).forEach(w => {
        //console.log(TemporaryBattleList[w].name);
        temp += `${TemporaryBattleList[w].name}|`;
        TemporaryBattleList[w].requirements.forEach(v => {
            temp += OrderRequirements(v, true);
        });
        TemporaryBattleList[w].parent?.requirements.forEach(v => {
            temp += OrderRequirements(v, true);
        });
        temp += '<<';
    });
    return temp;
};

const RouteAchieves = function () {
    const myself = player as Player;
    const cooldown = 1000;
    const highest = Math.max(...Routes.getRoutesByRegion(myself.region).map(v => v.orderNumber ?? 0));
    if (
        App.game.statistics.routeKills[myself.region][myself.route]() >= Math.max(...GameConstants.ACHIEVEMENT_DEFEAT_ROUTE_VALUES) &&
        GameConstants.Pokerus.Resistant === RouteHelper.minPokerus(RouteHelper.getAvailablePokemonList(myself.route, myself.region, true).filter(w => App.game.party.caughtPokemon.filter(v => v.name === w)[0].pokerus != GameConstants.Pokerus.Uninfected)) &&
        highest === Routes.getRoute(myself.region, myself.route).orderNumber
    ) {
        console.log('STOP - Route Achieves Finished');
        return;
    }
    if (
        App.game.statistics.routeKills[myself.region][myself.route]() >= Math.max(...GameConstants.ACHIEVEMENT_DEFEAT_ROUTE_VALUES) &&
        GameConstants.Pokerus.Resistant === RouteHelper.minPokerus(RouteHelper.getAvailablePokemonList(myself.route, myself.region, true).filter(w => App.game.party.caughtPokemon.filter(v => v.name === w)[0].pokerus != GameConstants.Pokerus.Uninfected)) &&
        highest != Routes.getRoute(myself.region, myself.route).orderNumber
    ) {
        MapHelper.moveToRoute(Routes.unnormalizeRoute(Routes.normalizedNumber(myself.region, myself.route, false) + 1), myself.region);
    }
    setTimeout(() => RouteAchieves(), cooldown);
    return;
};

const TemporaryBattleBot = function (battle: TemporaryBattle) {
    const cooldown = 100;
    if ( battle === undefined || TemporaryBattleList[battle.name] === undefined ) {
        return;
    }
    if ( TemporaryBattleRunner.running() ) {
        setTimeout(() => TemporaryBattleBot(battle), cooldown);
        return;
    }
    if ( battle.completeRequirements.every(v => v.isCompleted()) ) {
        console.log('STOP - TemporaryBattleBot');
        return;
    }
    TemporaryBattleRunner.startBattle(battle);
    setTimeout(() => TemporaryBattleBot(battle), cooldown);
    return;
};

const UndergoundSellAll = function () {
    const myself = player as Player;
    const items = [...new Set(Object.values(UndergroundItems.list).map(i => i.name))];
    for ( let i = 0; i < items.length; i++ ) {
        if ( UndergroundItems.getByName(items[i]).valueType == UndergroundItemValueType.Diamond ) {
            UndergroundController.sellMineItem(UndergroundItems.getByName(items[i]), myself.itemList[UndergroundItems.getByName(items[i]).itemName]());
        }
    }
};

const HighestOneShot = function (): string {
    const myself = player as Player;
    DamageCalculator.region(myself.region);
    DamageCalculator.weather(Weather.currentWeather());
    const routes = Routes.getRoutesByRegion(myself.region)
        .map(v => RouteHelper.getAvailablePokemonList(v.number, myself.region)
            .map((w, _, arr) => {
                const tempH = PokemonFactory.routeHealth(v.number, myself.region);
                const avg = arr.map(p => pokemonMap[p].base.hitpoints).reduce((acc, q, j) => (acc + (q - acc) / (j + 1)), 0);
                const health = Math.round((tempH - tempH / 10) + (tempH / 10 / avg * PokemonHelper.getPokemonByName(w).hitpoints));
                DamageCalculator.type1(PokemonHelper.getPokemonByName(w).type1);
                DamageCalculator.type2(PokemonHelper.getPokemonByName(w).type2);
                return DamageCalculator.totalDamage() >= health;
            })
            .every(Boolean) ? Routes.normalizedNumber(myself.region, v.number, false) : -1);

    return routes.length > 0 ? Routes.getName(Routes.unnormalizeRoute(Math.max(...routes)), myself.region) : 'No One Shot';
};

const HowLikelyShinyCatch = function (type: string): string {
    const myself = player as Player;
    const out: PokemonNameType[] = [];

    if ( type == 'R' ) {
        out.push(...RouteHelper.getAvailablePokemonList(myself.route, myself.region, true));
    }
    if ( type == 'D' ) {
        out.push(...(myself.town.dungeon?.allAvailablePokemon() as PokemonNameType[]));
    }

    const output = out.map(v => PokemonHelper.getPokemonByName(v).id)
        .filter(v => !App.game.party.alreadyCaughtPokemon(v, true))
        .map(v => [v, PokemonFactory.catchRateHelper(pokemonMap[v].catchRate, true), App.game.statistics.shinyPokemonEncountered[v]()])
        .map(v => `${PokemonHelper.getPokemonById(v[0]).name}: ${((1 - Math.pow((100 - (v[1] + 10)) / 100, v[2])) * 100).toFixed(2)}%`);

    return output.join('\n');
};

const HowManyDungeonRuns = function (): number {
    const myself = player as Player;
    return Math.floor(App.game.wallet.currencies[GameConstants.Currency.dungeonToken]() / (myself.town.dungeon?.tokenCost ?? 1));
};

const BattleFrontierBot = function () {
    const cooldown = 1000;
    if ( BattleFrontierRunner.started() ) {
        setTimeout(() => BattleFrontierBot(), cooldown);
        return;
    }
    BattleFrontierRunner.start(true);
    setTimeout(() => BattleFrontierBot(), cooldown);
    return;
};
