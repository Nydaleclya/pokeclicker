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
        .map(v => PokemonHelper.displayName(v.name))
        .concat(
            (SafariPokemonList.list[region] as KnockoutObservable<SafariEncounter[]>)()
                .filter(v => !(v.requirement instanceof ObtainedPokemonRequirement))
                .map(v => PokemonHelper.displayName(v.name))
        )
        .join(' <-> ');
};

const BerryRegionLocked = [
    /*Kanto*/   [],
    /*Johto*/   [],
    /*Hoenn*/   [BerryType.Pinkan, BerryType.Kee, BerryType.Maranga, BerryType.Liechi, BerryType.Ganlon, BerryType.Salac, BerryType.Enigma],
    /*Sinnoh*/  [BerryType.Apicot, BerryType.Lansat, BerryType.Snover],
    /*Unova*/   [],
    /*Kalos*/   [],
    /*Alola*/   [],
    /*Galar*/   [],
    /*Hisui*/   [BerryType.Hopo],
    /*Paldea*/  [],
];

const FarmWanderInfo = function (): string {
    const result: string[][] = [];
    const region = BerryRegionLocked;

    BerryList.forEach(v => !region.flat().includes(v.type) ? region[0].push(v.type) : null);
    region.forEach(() => result.push([]));

    const temp = BerryList.flatMap(v => v.wander.map(w => [w, region.flatMap((a, b) => a.includes(v.type) ? b : -1).filter(i => i >= 0)[0]]));
    [...new Set(temp.map(v => v[0] as PokemonNameType))]
        .map(v => [v, Math.max(Math.min(...temp.map(w => w[0] === v ? w[1] as number : -1).filter(j => j >= 0)), PokemonHelper.calcNativeRegion(v))])
        .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
        .forEach(v => result[v[1] as number].push(PokemonHelper.displayName(v[0] as PokemonNameType)));
    const result2: string[] = [];
    result.forEach(v => {
        result2.push(v.join('↔'));
    });
    return result2.join('↕');
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
            const heldItem = PokemonHelper.getPokemonByName(v.name).heldItem as BagItem;
            if ( heldItem.type === ItemType.item ) {
                heldItems.add(heldItem.id as string);
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

    return out.join('↔');
};

const TypedEggInfo = function (): string {
    const eggsMain: string[] = [];
    const maxLength = GameConstants.Region.final;
    for ( let i = 0; i < maxLength; i++ ) {
        const eggs = [];
        for (const EggItemType in GameConstants.EggItemType) {
            if ( !isNaN(Number(EggItemType)) ) {
                eggs.push((App.game.breeding.hatchList[EggItemType as unknown as GameConstants.EggItemType][i] ?? []).join('↔'));
            }
        }
        eggsMain.push(eggs.join('→'));
    }
    return eggsMain.join('↕');
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
        .map((route: RegionRoute) => [
            route.routeName,
            route.pokemon.land
                .concat(route.pokemon.water, route.pokemon.headbutt, ...route.pokemon.special.map(p => (!RemoveEvent(p.req) ? p.pokemon : []) ) )
                .map(v => PokemonHelper.displayName(v)),
        ]);
    Routes.getRoutesByRegion(region).forEach(v => {
        v.pokemon.special.forEach(w => {
            if (
                !(w.req instanceof WeatherRequirement) &&
                !(w.req instanceof SpecialEventRequirement) &&
                !(w.req instanceof MoonCyclePhaseRequirement) &&
                !(w.req instanceof DayOfWeekRequirement)
            ) {
                console.log(`${v.routeName} - ${w.pokemon} - ${w.req}`);
            }
        });
    });
    const result2: string[] = [];
    result.forEach(v => {
        const name = v[0];
        const pokemon = (v[1] as string[]).join('↔');
        result2.push(`${name}→${pokemon}`);
    });
    return result2.join('↕');
};

const DungeonsInfo = function (region: GameConstants.Region): string {
    const result = GameConstants.RegionDungeons[region]
        .map(k => [
            k,
            [dungeonList[k].enemyList, dungeonList[k].bossList].flat()
                .filter(v => !(v instanceof DungeonTrainer))
                .map(v => v instanceof DungeonBossPokemon ? (!RemoveEvent(v.options?.requirement) ? v.name : []) : v).flat()
                .map(v => v.hasOwnProperty('options') ? (!RemoveEvent((v as DetailedPokemon).options.requirement) ? (v as DetailedPokemon).pokemon : []) : v).flat()
                .map(v => PokemonHelper.displayName(v as PokemonNameType))
                .concat(
                    dungeonList[k].bossList
                        .filter(v => v instanceof DungeonTrainer)
                        .map(v => (v as DungeonTrainer).team).flat()
                        .filter(v => v.shadow == GameConstants.ShadowStatus.Shadow)
                        .map(v => PokemonHelper.displayName(v.name))
                ),
            Object.entries(dungeonList[k].lootTable).map(([_, v]) => v).flat()
                .filter(v => PokemonHelper.getPokemonByName(v.loot as PokemonNameType).id)
                .map(v => !RemoveEvent(v.requirement) ? v.loot : []).flat(),
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
    const result2: string[] = [];
    result.forEach(v => {
        const name = v[0];
        const pokemon = (v[1] as string[]).join('↔');
        const mimics = (v[2] as string[]).join('↔');
        result2.push(`${name}→${pokemon}→${mimics}`);
    });
    return result2.join('↕');
};

const choose = function (arr: string[], k: number, prefix: string[] = []): string[][] {
    if ( k === 0 ) {
        return [prefix];
    }
    return arr.flatMap((v, i) => choose(arr.slice(i + 1), k - 1, [...prefix, v]));
};

const PersonalNumberFormat = Intl.NumberFormat('en-US', {'minimumIntegerDigits': 4, 'minimumFractionDigits': 2, 'useGrouping': false});

const OrderRequirements = function (req: Requirement, ending: boolean): string {
    const dungeons = GameConstants.RegionDungeons.flat();
    let temp = '';

    if ( req.option === GameConstants.AchievementOption.less ) {
        //console.log(req);
        if (
            req instanceof GymBadgeRequirement ||
            req instanceof QuestLineStepCompletedRequirement ||
            req instanceof QuestLineStartedRequirement ||
            req instanceof QuestLineCompletedRequirement ||
            req instanceof TemporaryBattleRequirement ||
            req instanceof HoldingItemRequirement ||
            req instanceof ObtainedPokemonRequirement
        ) {
            return temp;
        }
    }

    if ( req instanceof LazyRequirementWrapper ) {
        temp += OrderRequirements(req.unwrap(), true);
    } else if ( req instanceof RouteKillRequirement ) {
        temp += Routes.getRoute(req.region, req.route).routeName;
    } else if ( req instanceof GymBadgeRequirement ) {
        temp += `${BadgeEnums[req.badge]} Badge`;
    } else if ( req instanceof ClearDungeonRequirement ) {
        temp += dungeons[req.dungeonIndex];
    } else if ( req instanceof InDungeonRequirement ) {
        temp += req.dungeon;
    } else if ( req instanceof TemporaryBattleRequirement ) {
        temp += req.battleName;
    } else if ( req instanceof PokemonLevelRequirement ) {
        temp += `Level ${req.requiredValue}`;
    } else if ( req instanceof MegaEvolveRequirement ) {
        temp += GameConstants.humanifyString(GameConstants.MegaStoneType[req.megaStone]);
    } else if ( req instanceof HoldingItemRequirement ) {
        temp += `Held Item: ${GameConstants.humanifyString(req.itemName)}`;
    } else if ( req instanceof QuestLineStepCompletedRequirement ) {
        const index = typeof req.questIndex == 'function' ? req.questIndex() : req.questIndex;
        temp += `[Q] ${req.questLineName} Step ${index}`;
    } else if ( req instanceof QuestLineStartedRequirement ) {
        temp += `[Q] ${req.questLineName} START`;
    } else if ( req instanceof QuestLineCompletedRequirement ) {
        temp += `[Q] ${req.questLineName} END`;
    } else if ( req instanceof SpecialEventRequirement ) {
        temp += 'Event Calendar';
    } else if ( req instanceof StarterRequirement ) {
        if ( !(req.requiredValue == GameConstants.Starter.Fire) ) {
            temp += 'FALSE';
        }
    } else if ( req instanceof InEnvironmentRequirement ) {
        const environmentData = GameConstants.Environments[req.environment];
        const keys: GameConstants.Region[] = Object.keys(environmentData).map(v => Number(v));

        const reqArray: string[] = [];
        for ( let i = 0; i < keys.length; i++ ) {
            const region = keys[i];
            const list = <Set<string|number>>environmentData[region];
            list.forEach(value => {
                if ( typeof value == 'string' ) {
                    reqArray.push(value);
                } else {
                    reqArray.push(Routes.getRoute(region, value).routeName);
                }
            });
        }
        if ( reqArray.length > 1 ) {
            temp += '→';
            temp += reqArray.join(' OR ');
            temp += '←';
        } else {
            temp += reqArray.join(' OR ');
        }
    } else if ( req instanceof ObtainedPokemonRequirement ) {
        const pokemon = req.pokemon;
        const id = PokemonHelper.getPokemonByName(pokemon).id;
        const idText = PersonalNumberFormat.format(id);
        temp += `Caught: ${idText} | ${pokemon}`;
    } else if ( req instanceof MaxRegionRequirement ) {
        if ( req.requiredValue > GameConstants.Region.kanto ) {
            const regionText = GameConstants.Region[req.requiredValue];
            const dockLocation = GameConstants.DockTowns[req.requiredValue];
            temp += `[N] ${regionText.charAt(0).toUpperCase()}${regionText.slice(1)}`;
            temp += '&&';
            let reqArray = TownList[dockLocation].requirements.map(v => OrderRequirements(v, false));
            reqArray = reqArray.filter(v => v);
            temp += reqArray.join('&&');
        }
    } else if ( req instanceof InRegionRequirement ) {
        const minRegion = Math.min(...req.regions);
        if ( minRegion > GameConstants.Region.kanto ) {
            const regionText = GameConstants.Region[minRegion];
            temp += `[N] ${regionText.charAt(0).toUpperCase()}${regionText.slice(1)}`;
        }
    } else if ( req instanceof CaughtUniquePokemonByFilterRequirement ) {
        let needed = req.requiredValue;
        const possiblePokemon = req.list
            .map(pokemonName => PokemonHelper.getPokemonByName(pokemonName))
            .map(pokemon => [pokemon.id, pokemon.name, Infinity]);

        for ( let k = 0; k < possiblePokemon.length; k++ ) {
            for ( let i = 0; i <= GameConstants.MAX_AVAILABLE_REGION; i++ ) {
                const locations: Partial<Record<PokemonLocationType, object[]|object>> =
                    PokemonLocations.getPokemonLocations(possiblePokemon[k][1] as PokemonNameType, i);
                if (
                    Object.keys(locations[PokemonLocationType.Route] ?? {}).length ||
                    (locations[PokemonLocationType.Roaming] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Dungeon] as object[] ?? []).length ||
                    (locations[PokemonLocationType.DungeonBoss] as object[] ?? []).length ||
                    (locations[PokemonLocationType.DungeonChest] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Evolution] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Egg] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Baby] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Shop] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Wandering] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Trade] as object[] ?? []).length ||
                    (locations[PokemonLocationType.GiftNPC] as object[] ?? []).length ||
                    (locations[PokemonLocationType.ShadowPokemon] as object[] ?? []).length ||
                    (locations[PokemonLocationType.DreamOrb] as object[] ?? []).length ||
                    Object.keys(locations[PokemonLocationType.BattleCafe] ?? {}).length ||
                    Object.keys(locations[PokemonLocationType.SafariItem] ?? {}).length
                ) {
                    possiblePokemon[k][2] = Math.min(possiblePokemon[k][2] as number, i);
                }
            }
        }

        let prefill = possiblePokemon;
        let region = GameConstants.MAX_AVAILABLE_REGION;
        while ( prefill.length > req.requiredValue ) {
            prefill = prefill.filter(arr => arr[2] as number < region);
            region = region - 1;
        }

        const prefix = prefill.map(pokemon => `Caught: ${PersonalNumberFormat.format(pokemon[0] as number)} | ${pokemon[1]}`);
        const possiblePokemon2 = possiblePokemon.filter(pokemon => {
            return !prefix.includes(`Caught: ${PersonalNumberFormat.format(pokemon[0] as number)} | ${pokemon[1]}`);
        });
        needed = needed - prefix.length;

        let possiblePokemon3 = possiblePokemon2.filter(_ => false);
        region = 0;
        while ( possiblePokemon3.length < needed ) {
            possiblePokemon3 = possiblePokemon2.filter(arr => arr[2] as number < region);
            region = region + 1;
        }
        const possiblePokemon4 = possiblePokemon3.map(pokemon => `Caught: ${PersonalNumberFormat.format(pokemon[0] as number)} | ${pokemon[1]}`);

        const combinations = choose(possiblePokemon4, needed, prefix).map(arr => `${arr.join(' AND ')}`);

        console.log('CaughtUniquePokemonByFilterRequirement');
        console.log(`Choosing: ${needed} from ${possiblePokemon4.length}`);
        console.log('----------');

        if ( combinations.length > 1 ) {
            temp += '→';
            temp += combinations.join(' OR ');
            temp += '←';
        } else {
            temp += combinations.join(' OR ');
        }
    } else if ( req instanceof MultiRequirement ) {
        let reqArray = req.requirements.map(v => OrderRequirements(v, false));
        reqArray = reqArray.filter(v => v);
        reqArray = reqArray.map(v => v.split('&&').join(' AND '));
        if ( reqArray.length > 1 ) {
            temp += '→';
            temp += reqArray.join(' AND ');
            temp += '←';
        } else {
            temp += reqArray.join(' AND ');
        }
    } else if ( req instanceof OneFromManyRequirement ) {
        let reqArray = req.requirements.map(v => OrderRequirements(v, false));
        reqArray = reqArray.filter(v => v);
        reqArray = reqArray.map(v => v.split('&&').join(' AND '));
        if ( reqArray.length > 1 ) {
            temp += '→';
            temp += reqArray.join(' OR ');
            temp += '←';
        } else {
            temp += reqArray.join(' OR ');
        }
    } else if ( req instanceof CustomRequirement ) {
        //console.log('CustomRequirement');
        //console.log(req);
        //console.log('----------');
    // These Requirements is only on stuff not yet intended to play with
    } else if ( req instanceof NullRequirement ) {
        temp += 'NULL';
    } else if ( req instanceof DevelopmentRequirement ) {
        temp += 'NULL';
        if ( req.requirement ) {
            temp += OrderRequirements(req.requirement, true);
        }
    // These Requirements are location independent and thus not needed to include.
    } else if (
        req instanceof WeatherRequirement ||
        req instanceof SeededDateSelectNRequirement ||
        req instanceof StatisticRequirement ||
        req instanceof DayCyclePartRequirement ||
        req instanceof MoonCyclePhaseRequirement ||
        req instanceof DayOfWeekRequirement ||
        req instanceof ItemOwnedRequirement ||
        req instanceof ClearGymRequirement ||
        req instanceof PokemonDefeatedSelectNRequirement ||
        req instanceof ClientRequirement ||
        req instanceof PokemonAttackRequirement ||
        req instanceof GameStateRequirement ||
        req instanceof SafariLevelRequirement
    ) {} else {
        console.log('Requirement not included');
        console.log(req);
        console.log('----------');
    }


    if ( ending ) {
        temp += '&&';
    }
    return temp;
};

const RouteOrder = function (region: GameConstants.Region): string {
    let temp = '';
    Routes.getRoutesByRegion(region).sort((a,b) => a.number - b.number).forEach(w => {
        let reqString = '';
        temp += `${w.routeName}↔`;
        w.requirements.forEach(v => {
            reqString += OrderRequirements(v, true);
        });
        let reqArray = reqString.split('&&');
        reqArray = RequirementArrayToDNF(reqArray);
        reqString = reqArray.join(' AND ');
        temp += reqString;
        temp += '↕';
    });
    return temp;
};

const DungeonOrder = function (region: GameConstants.Region): string {
    let temp = '';
    GameConstants.RegionDungeons[region].forEach(w => {
        temp += `${w}↔`;
        let reqString = '';
        if ( TownList[w].dungeon?.optionalParameters.requirement ) {
            reqString += OrderRequirements(TownList[w].dungeon.optionalParameters.requirement, true);
        }
        TownList[w].requirements.forEach(v => {
            reqString += OrderRequirements(v, true);
        });
        const rew = String(TownList[w].dungeon?.rewardFunction);
        if ( rew != '() => { }' ) {
            if ( rew.search('DungeonGainGymBadge') >= 0 ) {
                reqString += `${eval(`BadgeEnums[${rew.substring(rew.search('GymList')).replace(')','.badgeReward')}]`)} Badge|`;
            }
        }
        let reqArray = reqString.split('&&');
        reqArray = RequirementArrayToDNF(reqArray);
        reqString = reqArray.join(' AND ');
        temp += reqString;
        temp += '↕';
    });
    return temp;
};

const BadgeOrder = function (): string {
    let temp = '';
    GameConstants.RegionGyms.flat().sort((a,b) => GymList[a].badgeReward - GymList[b].badgeReward).forEach(w => {
        temp += `${BadgeEnums[GymList[w].badgeReward]} Badge↔`;
        let reqString = '';
        GymList[w].requirements.forEach(v => {
            reqString += OrderRequirements(v, true);
        });
        if ( GymList[w].hasOwnProperty('parent') ) {
            GymList[w].parent.requirements.forEach(v => {
                reqString += OrderRequirements(v, true);
            });
        }
        let reqArray = reqString.split('&&');
        reqArray = RequirementArrayToDNF(reqArray);
        reqString = reqArray.join(' AND ');
        temp += reqString;
        temp += '↕';
    });
    return temp;
};

const TemporaryBattleOrder = function (): string {
    let temp = '';
    Object.keys(TemporaryBattleList).forEach(w => {
        //console.log(TemporaryBattleList[w].name);
        if ( TemporaryBattleList[w].optionalArgs.resetDaily ) {} else {
            temp += `${TemporaryBattleList[w].name}↔`;
            let reqString = '';
            TemporaryBattleList[w].requirements.forEach(v => {
                reqString += OrderRequirements(v, true);
            });
            TemporaryBattleList[w].parent?.requirements.forEach(v => {
                reqString += OrderRequirements(v, true);
            });
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            temp += reqString;
            temp += '↕';
        }
    });
    return temp;
};

const safariTownsGlobal = function (): Record<GameConstants.Region, Town> {
    const noSafariTown = TownList['Final Region Town'];
    return {
        [GameConstants.Region.none]: noSafariTown,
        [GameConstants.Region.kanto]: TownList['Safari Zone'],
        [GameConstants.Region.johto]: TownList['National Park'],
        [GameConstants.Region.hoenn]: noSafariTown,
        [GameConstants.Region.sinnoh]: TownList['Great Marsh'],
        [GameConstants.Region.unova]: noSafariTown,
        [GameConstants.Region.kalos]: TownList['Friend Safari'],
        [GameConstants.Region.alola]: TownList['Hoppy Town Fishing Pond'],
        [GameConstants.Region.galar]: noSafariTown,
        [GameConstants.Region.hisui]: noSafariTown,
        [GameConstants.Region.paldea]: noSafariTown,
        [GameConstants.Region.final]: noSafariTown,
    };
};

const PokemonOrder = function (filterID?: number): string[] {
    let temp = '';
    const list = pokemonList as Array<PokemonListData>;
    const filtered = list.filter(pokemon => pokemon.id > 0 && (filterID ? pokemon.id == filterID : true));

    for ( let idx = 0; idx < filtered.length; idx++ ) {
        const pokemonName = filtered[idx].name;
        const pokemonID = filtered[idx].id;
        const pokemonIDText = PersonalNumberFormat.format(pokemonID);
        const nativeRegionText = GameConstants.Region[filtered[idx].nativeRegion];

        temp += `Caught: ${pokemonIDText} | ${pokemonName}↔`;

        const maxRegion = GameConstants.MAX_AVAILABLE_REGION;
        let locationArray: string[] = [];

        // Route
        const regionRoutes = <Record<string ,{route: number, requirements?: Requirement}[]>>PokemonLocations.getPokemonRegionRoutes(pokemonName, maxRegion);
        if (Object.keys(regionRoutes).length) {
            for ( const [region, routes] of Object.entries(regionRoutes) ) {
                for ( let i = 0; i < routes.length; i++ ) {
                    const obj = routes[i];
                    const route = Routes.getRoute(Number(region), obj.route).routeName;
                    let reqString = '';
                    if ( obj.requirements instanceof Requirement ) {
                        reqString = OrderRequirements(obj.requirements, true);
                    }
                    reqString += route;
                    let reqArray = reqString.split('&&');
                    reqArray = RequirementArrayToDNF(reqArray);
                    reqString = reqArray.join(' AND ');
                    locationArray.push(reqString);
                }
            }
        }

        // Roaming
        const roaming = <Array<{region: number, requirements?: Requirement, roamingGroup: any}>>PokemonLocations.getPokemonRoamingRegions(pokemonName, maxRegion);
        if (roaming.length) {
            for ( let k = 0; k < roaming.length; k++ ) {
                const obj = roaming[k];
                const regionText = GameConstants.Region[obj.region];
                let reqString = '';
                if ( obj.requirements instanceof Requirement ) {
                    reqString = OrderRequirements(obj.requirements, true);
                }
                reqString += obj.region > GameConstants.Region.kanto ? `[N] ${regionText.charAt(0).toUpperCase()}${regionText.slice(1)}` : 'TRUE';
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Dungeon
        const dungeons = <Array<{dungeon: string, requirements?: Requirement}>>PokemonLocations.getPokemonDungeons(pokemonName, maxRegion);
        if (dungeons.length) {
            for ( let k = 0; k < dungeons.length; k++ ) {
                const obj = dungeons[k];
                let reqString = '';
                if ( obj.requirements instanceof Requirement ) {
                    reqString = OrderRequirements(obj.requirements, true);
                }
                reqString += obj.dungeon;
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Dungeon Boss
        const bossDungeons = <Array<{dungeon: string, requirements?: Requirement}>>PokemonLocations.getPokemonBossDungeons(pokemonName, maxRegion);
        if (bossDungeons.length) {
            for ( let k = 0; k < bossDungeons.length; k++ ) {
                const obj = bossDungeons[k];
                let reqString = '';
                if ( obj.requirements instanceof Requirement ) {
                    reqString = OrderRequirements(obj.requirements, true);
                }
                reqString += obj.dungeon;
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Dungeon Chest
        const chestDungeons = <Array<{dungeon: string, requirements?: Requirement}>>PokemonLocations.getPokemonChestDungeons(pokemonName, maxRegion);
        if (chestDungeons.length) {
            for ( let k = 0; k < chestDungeons.length; k++ ) {
                const obj = chestDungeons[k];
                let reqString = '';
                if ( obj.requirements instanceof Requirement ) {
                    reqString = OrderRequirements(obj.requirements, true);
                }
                reqString += obj.dungeon;
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Evolution
        const evolutions = PokemonLocations.getPokemonPrevolution(pokemonName, maxRegion);
        if (evolutions.length) {
            for ( let k = 0; k < evolutions.length; k++ ) {
                const obj = evolutions[k];
                let reqString = '';
                for ( let i = 0; i < obj.restrictions.length; i++ ) {
                    reqString += OrderRequirements(obj.restrictions[i], true);
                }
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Eggs
        const eggs = PokemonLocations.getPokemonEggs(pokemonName, maxRegion);
        if (eggs.length) {
            locationArray.push(...eggs
                .map(v => `Typed Eggs: ${GameConstants.humanifyString(v)}`)
                .map(v => filtered[idx].nativeRegion > GameConstants.Region.kanto ?
                    `${v} AND [N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}` : v)
            );
        }

        // Baby
        const parents = PokemonLocations.getPokemonParents(pokemonName, maxRegion);
        if (parents.length) {
            locationArray.push(...parents
                .map(pokemon => `Caught: ${PersonalNumberFormat.format(PokemonHelper.getPokemonByName(<PokemonNameType>pokemon).id)} | ${pokemon}`)
                .map(v => filtered[idx].nativeRegion > 0 ? `${v} AND [N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}` : v)
            );
        }

        // Shops
        const shops = PokemonLocations.getPokemonShops(pokemonName, maxRegion);
        if (shops.length) {
            for ( let k = 0; k < shops.length; k++ ) {
                const town = TownList[shops[k]];
                const townShops = (<Shop[]>town.content.filter(c => c instanceof Shop))
                    .filter(c => c.items.filter(i => i instanceof PokemonItem && i.name == pokemonName).length > 0);

                let reqString = '';
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
                }
                for ( let j = 0; j < townShops.length; j++ ) {
                    for ( let i = 0; i < townShops[j].requirements.length; i++ ) {
                        reqString += OrderRequirements(townShops[j].requirements[i], true);
                    }
                }
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Safari
        const safariChance = PokemonLocations.getPokemonSafariChance(pokemonName) as Record<GameConstants.Region, {requirement?: Requirement, chances: Record<GameConstants.Region, number>}>;
        const safariTowns = safariTownsGlobal();

        const safaris: GameConstants.Region[] = Object.keys(safariChance).map(v => Number(v));
        if (safaris.length) {
            for ( let k = 0; k < safaris.length; k++ ) {
                const region = safaris[k];
                const town = safariTowns[region];
                let reqString = '';
                if ( safariChance[region].requirement instanceof Requirement ) {
                    reqString += OrderRequirements(safariChance[region].requirement, true);
                }
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
                }
                // Require Safari Ticket
                if ( region == GameConstants.Region.kanto ) {
                    reqString += 'Key Item: Safari Ticket';
                }
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Battle Frontier
        const battleFrontier = PokemonLocations.getPokemonBattleFrontier(pokemonName);
        if (battleFrontier.length) {
            const town = TownList['Battle Frontier'];
            let reqString = filtered[idx].nativeRegion > GameConstants.Region.hoenn ?
                `[N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}&&` : '';
            for ( let i = 0; i < town.requirements.length; i++ ) {
                reqString += OrderRequirements(town.requirements[i], true);
            }

            let milestones: BattleFrontierMilestonePokemon[] = BattleFrontierMilestones.milestoneRewards;
            milestones = milestones.filter(v => battleFrontier.includes(v.stage));
            if ( milestones.length > 1 ) {
                reqString += '→';
                reqString += milestones.map(milestone => OrderRequirements(milestone.requirement as Requirement, false)).join(' OR ');
                reqString += '←';
            } else {
                reqString += milestones.map(milestone => OrderRequirements(milestone.requirement as Requirement, false)).join(' OR ');
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Wandering
        const wandering = <Array<'Always'|keyof typeof BerryType>>PokemonLocations.getPokemonWandering(pokemonName, maxRegion);
        if (wandering.length) {
            let reqString = '';
            reqString += 'Key Item: Wailmer Pail&&';
            if ( wandering[0] == 'Always' ) {
                reqString += filtered[idx].nativeRegion > GameConstants.Region.kanto ?
                    `[N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}&&` : '';
                reqString += 'TRUE';
            } else {
                const newWandering = <Array<keyof typeof BerryType>>wandering;
                let region = Infinity;
                for ( let i = 0; i < newWandering.length; i++ ) {
                    const temp = BerryRegionLocked.map((arr, k) => arr.includes(BerryType[newWandering[i]]) ? k : -1).filter(v => v > -1);
                    if ( temp.length == 0 ) {
                        temp.push(0);
                    }
                    region = Math.min(region, ...temp);
                }
                region = Math.max(region, filtered[idx].nativeRegion);
                const regionText = GameConstants.Region[region];
                reqString += region > GameConstants.Region.kanto ? `[N] ${regionText.charAt(0).toUpperCase()}${regionText.slice(1)}&&` : '';
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Discord
        const discord = PokemonLocations.getPokemonDiscord(pokemonName);
        if (discord.length) {
            const reqString = filtered[idx].nativeRegion > GameConstants.Region.kanto ?
                `[N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}` : 'TRUE';
            locationArray.push(reqString);
        }

        // Quest Line reward
        const questLineReward = PokemonLocations.getPokemonQuestLineReward(pokemonName);
        if (questLineReward.length) {
            const pokemonRewardRegex = /gainPokemonByName\('(.+?)'/g;
            const questList = App.game.quests.questLines()
                .filter(questLine => questLineReward.includes(questLine.name))
                .flatMap(questLine => {
                    const questIndex = questLine.quests().map(quest => {
                        const rewards = [];
                        let match;
                        while ((match = pokemonRewardRegex.exec(quest.customReward?.toString() as string)) != null) {
                            // match[1] is the contents of the capture group, e.g. "Eevee"
                            rewards.push(match[1]);
                        }
                        return rewards.includes(pokemonName) ? quest.index : -Infinity;
                    }).filter(v => v > -Infinity);
                    return questIndex.map(v => `[Q] ${questLine.name} Step ${v - 1}`);
                });

            let reqString = '';
            if ( questList.length > 1 ) {
                reqString += '→';
                reqString += questList.join(' OR ');
                reqString += '←';
            } else {
                reqString += questList.join(' OR ');
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Temp battle reward
        const tempBattle = PokemonLocations.getPokemonTempBattleReward(pokemonName);
        if (tempBattle.length) {
            let reqString = '';
            if ( tempBattle.length > 1 ) {
                reqString += '→';
                reqString += tempBattle.join(' OR ');
                reqString += '←';
            } else {
                reqString += tempBattle.join(' OR ');
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Gym reward
        const gymReward = PokemonLocations.getPokemonGymReward(pokemonName);
        if (gymReward.length) {
            const gyms = Object.entries(GymList).map(v => v[1])
                .filter(gym => gymReward.includes(gym.leaderName))
                .map(gym => `${BadgeEnums[gym.badgeReward]} Badge`);
            let reqString = '';
            if ( gyms.length > 1 ) {
                reqString += '→';
                reqString += gyms.join(' OR ');
                reqString += '←';
            } else {
                reqString += gyms.join(' OR ');
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Dungeon reward
        const dungeonReward = PokemonLocations.getPokemonDungeonReward(pokemonName);
        if (dungeonReward.length) {
            let reqString = '';
            if ( dungeonReward.length > 1 ) {
                reqString += '→';
                reqString += dungeonReward.join(' OR ');
                reqString += '←';
            } else {
                reqString += dungeonReward.join(' OR ');
            }
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Trades
        const trades = PokemonLocations.getPokemonTrades(pokemonName, maxRegion);
        if (trades.length) {
            for ( let k = 0; k < trades.length; k++ ) {
                const town = TownList[trades[k]];
                let shops = town.content.filter(c => c instanceof Shop);
                let deals = shops.map(shop => {
                    if (shop instanceof GemMasterShop) {
                        return GemDeals.list[shop.shop]?.().filter(deal => deal.item.itemType.type == pokemonName);
                    } else if (shop instanceof ShardTraderShop) {
                        return ShardDeal.list[shop.location]?.().filter(deal => deal.item.itemType.type == pokemonName);
                    } else if (shop instanceof BerryMasterShop) {
                        return BerryDeal.list[shop.location]?.().filter(deal => deal.item.itemType.type == pokemonName);
                    } else if (shop instanceof GenericTraderShop) {
                        return GenericDeal.list[shop.traderID]?.()
                            .filter(deal => deal.profits.some(profit => profit.type === DealCostOrProfitType.Item && profit.item.type == pokemonName));
                    }
                });
                shops = shops.filter((_, shopIdx) => deals[shopIdx]);
                deals = deals.filter(v => v);
                shops = shops.filter((_, shopIdx) => deals[shopIdx]?.length && deals[shopIdx].length > 0);
                deals = deals.filter(v => v?.length && v.length > 0);
                let reqString = '';
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
                }

                for ( let j = 0; j < shops.length; j++ ) {
                    const tempArr = [];
                    const len = deals[j]?.length ?? 0;
                    for ( let i = 0; i < len; i++ ) {
                        const deal = (<GemDeal[]|ShardDeal[]|BerryDeal[]|GenericDeal[]>deals[j])[i];
                        if ( deal instanceof GemDeal && deal.item.itemType.visible instanceof Requirement ) {
                            tempArr.push(OrderRequirements(deal.item.itemType.visible, false));
                        } else if ( deal instanceof ShardDeal && deal.item.itemType.visible instanceof Requirement ) {
                            tempArr.push(OrderRequirements(deal.item.itemType.visible, false));
                        } else if ( deal instanceof BerryDeal && deal.item.itemType.visible instanceof Requirement ) {
                            tempArr.push(OrderRequirements(deal.item.itemType.visible, false));
                        } else if ( deal instanceof GenericDeal && deal.requirement instanceof Requirement ) {
                            tempArr.push(OrderRequirements(deal.requirement, false));
                        }
                    }

                    for ( let i = 0; i < shops[j].requirements.length; i++ ) {
                        reqString += OrderRequirements(shops[j].requirements[i], true);
                    }
                    if ( tempArr.length > 1 ) {
                        reqString += '→';
                        reqString += tempArr.join(' OR ');
                        reqString += '←';
                    } else {
                        reqString += tempArr.join(' OR ');
                    }
                }

                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Gift NPC
        const gifts = PokemonLocations.getPokemonGifts(pokemonName, maxRegion);
        if (gifts.length) {
            for ( let i = 0; i < gifts.length; i++ ) {
                const gift = <{town: string, npc: string, requirements?: Requirement}>gifts[i];
                const town = TownList[gift.town];
                let reqString = '';
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
                }
                if ( gift.requirements instanceof Requirement ) {
                    reqString += OrderRequirements(gift.requirements, true);
                }
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        // Shadow Pokemon
        const shadowPokemon = PokemonLocations.getShadowPokemonDungeons(pokemonName, maxRegion);
        locationArray.push(...shadowPokemon);

        // Dream Orbs
        const dreamOrbs = PokemonLocations.getPokemonDreamOrbs(pokemonName, maxRegion);
        if (dreamOrbs.length) {
            locationArray.push(...dreamOrbs.map(color => `[S] Dream Orb ${color}`));
        }

        // Battle Café
        const combination = PokemonLocations.getBattleCafeCombination(pokemonName, maxRegion);
        if (Object.keys(combination).length) {
            const town = TownList.Motostoke;
            const milceryReq = new ObtainedPokemonRequirement('Milcery');
            let reqString = '';
            for ( let i = 0; i < town.requirements.length; i++ ) {
                reqString += OrderRequirements(town.requirements[i], true);
            }
            reqString += OrderRequirements(milceryReq, true);
            let reqArray = reqString.split('&&');
            reqArray = RequirementArrayToDNF(reqArray);
            reqString = reqArray.join(' AND ');
            locationArray.push(reqString);
        }

        // Safari Items
        const safariItems = PokemonLocations.getPokemonSafariItem(pokemonName, maxRegion);
        if (Object.keys(safariItems).length) {
            for ( const [k, obj] of Object.entries(safariItems) ) {
                const region = <GameConstants.Region>Number(k);
                const town = safariTowns[region] as Town;
                let reqString = '';
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
                }
                if ( obj.requirement instanceof Requirement ) {
                    reqString += OrderRequirements(obj.requirement, true);
                }
                // Require Safari Ticket
                if ( region == GameConstants.Region.kanto ) {
                    reqString += 'Key Item: Safari Ticket&&';
                }
                let reqArray = reqString.split('&&');
                reqArray = RequirementArrayToDNF(reqArray);
                reqString = reqArray.join(' AND ');
                locationArray.push(reqString);
            }
        }

        locationArray = RequirementArrayToDNF(locationArray);
        locationArray = locationArray.filter((val, i, arr) => arr.indexOf(val) === i);
        if ( locationArray.length > 0 ) {
            temp += locationArray.join(' OR ');
        } else {
            temp += 'NULL';
        }

        temp += '↕';
    }

    const out: string[] = [];
    const amount = 65500;
    let amountIdx = 0;
    let outString = temp.slice(amount * amountIdx, amount * (amountIdx + 1));
    while ( outString != '' ) {
        out.push(outString);
        amountIdx++;
        outString = temp.slice(amount * amountIdx, amount * (amountIdx + 1));
    }

    return out;
};

const RequirementArrayToDNF = function (req: Array<string>): Array<string> {
    req = req.filter((val, i, arr) => arr.indexOf(val) === i);
    req = req.filter(v => v);

    if ( req.some(v => v.includes('→')) ) {
        if ( req.every(v => v.split('OR').length == 1) ) {
            req = req.map(v => v.replace(/^→/gm, '').replace(/←$/g,''));
            req = req.map(v => v.split(' AND ')).flat();
        } else if ( req.every(v => v.split('OR').length > 1) ) {
            req = req.map(v => v.replace(/^→/gm, '').replace(/←$/g,''));
            const temp = req.map(v => v.split(' OR '));
            for ( let i = 0; i < temp.length; i++ ) {
                for ( let k = 0; k < temp[i].length; k++ ) {
                    temp[i][k] = RequirementArrayToDNF([temp[i][k]]).join(' AND ');
                }
                temp[i] = [temp[i].join(' OR ')];
            }
            req = temp.flat();
        } else {
            req = req.map(v => v.replace(/^→/gm, '').replace(/←$/g,''));
            if ( req.every(v => !v.match(/→.*OR.*←/m))) {
                let temp: string[][] = [[]];
                for ( let i = 0; i < req.length; i++ ) {
                    if ( req[i].split('OR').length == 1 ) {
                        for ( let k = 0; k < temp.length; k++ ) {
                            temp[k].push(req[i]);
                        }
                    } else {
                        const helper = req[i].split(' OR ');
                        const temp2 = temp;
                        temp = [];
                        for ( let k = 0; k < helper.length; k++ ) {
                            for ( let j = 0; j < temp2.length; j++ ) {
                                temp.push([...temp2[j], helper[k]]);
                            }
                        }
                    }
                }
                temp = temp.map(v => RequirementArrayToDNF(v));
                temp = temp.map(v => RequirementArrayToDNF(v));

                for ( let i = 0; i < temp.length; i++ ) {
                    for (let k = 0; k < temp.length; k++ ) {
                        if ( i != k ) {
                            if ( temp[i].every(v => temp[k].includes(v)) ) {
                                temp[k] = [];
                                temp = temp.filter(v => v.length);
                                i = -1;
                                break;
                            }
                        }
                    }
                }

                for ( let i = 0; i < temp.length; i++ ) {
                    for (let k = 0; k < temp.length; k++ ) {
                        if ( i != k ) {
                            if ( temp[i].length == temp[k].length ) {
                                const keepA = temp[i].filter(v => !v.match(/\[Q\]/g)).sort();
                                const keepB = temp[k].filter(v => !v.match(/\[Q\]/g)).sort();
                                const everythingElse = keepA.every((v, i) => v == keepB[i]);
                                if ( everythingElse ) {
                                    const checkA = temp[i].filter(v => v.match(/\[Q\]/g)).sort();
                                    const checkB = temp[k].filter(v => v.match(/\[Q\]/g)).sort();
                                    if ( checkA.every((v, i) => QuestStepSmaller(v, checkB[i])) ) {
                                        temp[k] = [];
                                        temp = temp.filter(v => v.length);
                                        i = -1;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                req = [temp.map(v => v.join(' AND ')).join(' OR ')];
            }
        }
    } else if ( req.filter(v => v.match(/\[Q\]/g)).length > 1 ) {
        const keep = req.filter(v => !v.match(/\[Q\]/g));
        let toCheck: Array<string> = req.filter(v => v.match(/\[Q\]/g));
        for ( let i = 0; i < toCheck.length; i++ ) {
            for ( let k = 0; k < toCheck.length; k++ ) {
                if ( i != k ) {
                    if ( QuestStepBigger(toCheck[i], toCheck[k]) ) {
                        toCheck[k] = '';
                        toCheck = toCheck.filter(v => v);
                        i = -1;
                        break;
                    }
                }
            }
        }
        req = [keep, toCheck].flat();
    }

    req = req.filter((val, i, arr) => arr.indexOf(val) === i);
    return req;
};

const QuestStepSmaller = function (a: string, b: string): boolean {
    if ( a.split('START')[0].split('END')[0].split('Step')[0] != b.split('START')[0].split('END')[0].split('Step')[0]) {
        return false;
    }
    if ( a.includes('START') ) {
        return true;
    }
    if ( b.includes('END') ) {
        return true;
    }
    if ( Number(a.split('Step')[1]) <= Number(b.split('Step')[1]) ) {
        return true;
    }
    return false;
};

const QuestStepBigger = function (a: string, b: string): boolean {
    if ( a.split('START')[0].split('END')[0].split('Step')[0] != b.split('START')[0].split('END')[0].split('Step')[0]) {
        return false;
    }
    if ( a.includes('END') ) {
        return true;
    }
    if ( b.includes('START') ) {
        return true;
    }
    if ( Number(a.split('Step')[1]) >= Number(b.split('Step')[1]) ) {
        return true;
    }
    return false;
};

const RouteAchieves = function () {
    const myself = player as Player;
    const cooldown = 1000;
    const highest = Math.max(...Routes.getRoutesByRegion(myself.region).map(v => v.orderNumber ?? 0));
    const killsRequired = Math.max(...GameConstants.ACHIEVEMENT_DEFEAT_ROUTE_VALUES);
    /*
    if ( myself.region === GameConstants.Region.galar && myself.subregion === GameConstants.GalarSubRegions.Lental ) {
        killsRequired = Math.max(...GameConstants.ResearchLevel);
    }
    */
    const pokemonOnRoute = RouteHelper.getAvailablePokemonList(myself.route, myself.region, true)
        .filter(w => App.game.party.caughtPokemon.filter(v => v.name === w)[0].pokerus != GameConstants.Pokerus.Uninfected);

    const testKills = App.game.statistics.routeKills[myself.region][myself.route]() >= killsRequired;
    const testPokerus = GameConstants.Pokerus.Resistant === RouteHelper.minPokerus(pokemonOnRoute);
    const testHighest = highest === Routes.getRoute(myself.region, myself.route).orderNumber;

    if ( testKills && testPokerus && testHighest ) {
        console.log('STOP - Route Achieves Finished');
        return;
    }
    if ( testKills && testPokerus && !testHighest ) {
        MapHelper.moveToRoute(Routes.unnormalizeRoute(Math.max(...Routes.regionRoutes.map((v, i) => (v.region == myself.region && v.number == myself.route ? i : -1))) + 2), myself.region);
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
            .every(Boolean) ? Math.max(...Routes.regionRoutes.map((v, i) => (v.region == myself.region && v.number == myself.route ? i : -1))) + 1 : -1);

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
