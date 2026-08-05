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

const BerryRegionLocked = [
    /*Kanto*/   [],
    /*Johto*/   [BerryType.Chople, BerryType.Kebia, BerryType.Shuca, BerryType.Charti, BerryType.Babiri, BerryType.Chilan, BerryType.Petaya], //#5484 -> []
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

    App.game.farming.berryData.forEach(v => !region.flat().includes(v.type) ? region[0].push(v.type) : null);
    region.forEach(() => result.push([]));

    const temp = App.game.farming.berryData.flatMap(v => v.wander.map(w => [w, region.flatMap((a, b) => a.includes(v.type) ? b : -1).filter(i => i >= 0)[0]]));
    [...new Set(temp.map(v => v[0] as PokemonNameType))]
        .map(v => [v, Math.max(Math.min(...temp.map(w => w[0] === v ? w[1] as number : -1).filter(j => j >= 0)), PokemonHelper.calcNativeRegion(v))])
        .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
        .forEach(v => result[v[1] as number].push(PokemonHelper.displayName(v[0] as PokemonNameType)()));
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
                .map(v => PokemonHelper.displayName(v)()),
        ]);
    Routes.getRoutesByRegion(region).forEach(v => {
        v.pokemon.special.forEach(w => {
            if (
                !(w.req instanceof WeatherRequirement) &&
                !(w.req instanceof SpecialEventRequirement) &&
                !(w.req instanceof MoonCyclePhaseRequirement)
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
                .map(v => PokemonHelper.displayName(v as PokemonNameType)())
                .concat(
                    dungeonList[k].bossList
                        .filter(v => v instanceof DungeonTrainer)
                        .map(v => (v as DungeonTrainer).team).flat()
                        .filter(v => v.shadow == GameConstants.ShadowStatus.Shadow)
                        .map(v => PokemonHelper.displayName(v.name)())
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
            let reqArray = TownList[dockLocation].requirements.map(v => OrderRequirements(v, true));
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
        const possiblePokemon = pokemonList
            .filter(pokemon => req.filter(<PartyPokemon><unknown>pokemon))
            .map(pokemon => [pokemon.id, pokemon.name, Infinity]);

        for ( let k = 0; k < possiblePokemon.length; k++ ) {
            for ( let i = 0; i <= GameConstants.MAX_AVAILABLE_REGION; i++ ) {
                const locations: Partial<Record<PokemonLocationType, object[]|object>> =
                    PokemonLocations.getPokemonLocations(possiblePokemon[k][1] as PokemonNameType, i);
                if (
                    Object.keys(locations[PokemonLocationType.Route] ?? {}).length ||
                    (locations[PokemonLocationType.Dungeon] as object[] ?? []).length ||
                    (locations[PokemonLocationType.DungeonBoss] as object[] ?? []).length ||
                    (locations[PokemonLocationType.DungeonChest] as object[] ?? []).length ||
                    (locations[PokemonLocationType.ShadowPokemon] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Egg] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Shop] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Roaming] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Baby] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Evolution] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Wandering] as object[] ?? []).length ||
                    (locations[PokemonLocationType.Trade] as object[] ?? []).length ||
                    (locations[PokemonLocationType.GiftNPC] as object[] ?? []).length ||
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

        // Shadow Pokemon
        const shadowPokemon = PokemonLocations.getShadowPokemonDungeons(pokemonName, maxRegion);
        locationArray.push(...shadowPokemon);

        // Eggs
        const eggs = PokemonLocations.getPokemonEggs(pokemonName, maxRegion);
        if (eggs.length) {
            locationArray.push(...eggs
                .map(v => `Typed Eggs: ${GameConstants.humanifyString(v)}`)
                .map(v => filtered[idx].nativeRegion > GameConstants.Region.kanto ?
                    `${v} AND [N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}` : v)
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

        // Baby
        const parents = PokemonLocations.getPokemonParents(pokemonName, maxRegion);
        if (parents.length) {
            locationArray.push(...parents
                .map(pokemon => `Caught: ${PersonalNumberFormat.format(PokemonHelper.getPokemonByName(<PokemonNameType>pokemon).id)} | ${pokemon}`)
                .map(v => filtered[idx].nativeRegion > 0 ? `${v} AND [N] ${nativeRegionText.charAt(0).toUpperCase()}${nativeRegionText.slice(1)}` : v)
            );
        }

        // Safari
        const safariChance = PokemonLocations.getPokemonSafariChance(pokemonName);
        const safariTowns: Partial<Record<GameConstants.Region, Town>> = {
            [GameConstants.Region.kanto]: TownList['Safari Zone'],
            [GameConstants.Region.johto]: TownList['National Park'],
            [GameConstants.Region.sinnoh]: TownList['Great Marsh'],
            [GameConstants.Region.kalos]: TownList['Friend Safari'],
            [GameConstants.Region.alola]: TownList['Hoppy Town Fishing Pond'],
        };

        const safaris: GameConstants.Region[] = Object.keys(safariChance).map(v => Number(v));
        if (safaris.length) {
            for ( let k = 0; k < safaris.length; k++ ) {
                const region = safaris[k];
                const pokemonList = SafariPokemonList.list[region]?.() as SafariEncounter[];
                const town = safariTowns[region] as Town;
                let reqString = '';
                if ( pokemonList.filter(encounter => encounter.name === pokemonName)[0].requirement instanceof Requirement ) {
                    reqString += OrderRequirements(pokemonList.filter(encounter => encounter.name === pokemonName)[0].requirement, true);
                }
                for ( let i = 0; i < town.requirements.length; i++ ) {
                    reqString += OrderRequirements(town.requirements[i], true);
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

const PokemonRequiredEverstone = function (type: PokemonType): string[] {
    const list = (pokemonList as Array<PokemonListData>)
        .filter(pokemon => pokemon.type.includes(type))
        .map(pokemon => PokemonHelper.getPokemonByName(pokemon.name));

    const out = list.filter(poke =>
        (poke.evolutions && poke.evolutions.some(k => k.trigger == EvoTrigger.LEVEL && !list.map(p => p.name).includes(k.evolvedPokemon) && !k.restrictions.some(r => r instanceof HoldingItemRequirement && r.option == 2))) ||
        (pokemonBabyPrevolutionMap[poke.name] && !list.map(k => k.name).includes(pokemonBabyPrevolutionMap[poke.name]))
    );

    return out.map(p => p.name);
};

const PokemonNotAvailableFilter = function (pokemon: PokemonListData, included: PokemonNameType[] = [], includedTypes: PokemonType[] = [], cache: string[] = []): {0: boolean, 1: string[]} {
    const locations: Partial<Record<PokemonLocationType, Array<any>>> = PokemonLocations.getPokemonLocations(pokemon.name, GameConstants.MAX_AVAILABLE_REGION);
    let isPossible = false;
    let test;
    if (    locations[PokemonLocationType.Route] ||
            locations[PokemonLocationType.Egg] ||
            locations[PokemonLocationType.Discord] ||
            (locations[PokemonLocationType.Evolution] && locations[PokemonLocationType.Evolution].some((p: EvoData) => included.includes(p.basePokemon))) ||
            (locations[PokemonLocationType.Baby] && locations[PokemonLocationType.Baby].some(parent => included.includes(parent))) ||
            (locations[PokemonLocationType.Dungeon] && locations[PokemonLocationType.Dungeon].some(o => {
                test = RequirementTrivial(o.requirements, included, includedTypes, cache);
                cache = [cache, test[1]].flat().filter((ele, idx, arr) => arr.indexOf(ele) === idx);
                return test[0];
            })) ||
            (locations[PokemonLocationType.DungeonBoss] && locations[PokemonLocationType.DungeonBoss].some(o => {
                test = RequirementTrivial(o.requirements, included, includedTypes, cache);
                cache = [cache, test[1]].flat().filter((ele, idx, arr) => arr.indexOf(ele) === idx);
                return test[0];
            })) ||
            (locations[PokemonLocationType.DungeonChest] && locations[PokemonLocationType.DungeonChest].some(o => {
                test = RequirementTrivial(o.requirements, included, includedTypes, cache);
                cache = [cache, test[1]].flat().filter((ele, idx, arr) => arr.indexOf(ele) === idx);
                return test[0];
            })) ||
            (locations[PokemonLocationType.Roaming] && locations[PokemonLocationType.Roaming].some(o => {
                test = RequirementTrivial(o.requirements, included, includedTypes, cache);
                cache = [cache, test[1]].flat().filter((ele, idx, arr) => arr.indexOf(ele) === idx);
                return test[0];
            }))
    ) {
        isPossible = true;
    }
    return {0: isPossible, 1: cache};
};

const PokemonNotAvailable = function (type: PokemonType | PokemonType[]): string[] {
    const typeList = [type].flat();
    const list = (pokemonList as Array<PokemonListData>)
        .filter(pokemon => pokemon.type.some(t => typeList.includes(t)));

    const included: PokemonNameType[] = [];
    const includedTypes: Set<PokemonType> = new Set([...typeList]);
    let cache: string[] = [];

    const out = list.filter(pokemon => {
        let isPossible = false;
        const test = PokemonNotAvailableFilter(pokemon, included, [...includedTypes], cache);
        cache = [cache, test[1]].flat().filter((ele, idx, arr) => arr.indexOf(ele) === idx);
        if ( test[0] ) {
            included.push(pokemon.name);
            pokemon.type.forEach(v => includedTypes.add(v));
            isPossible = true;
        }
        return !isPossible;
    });

    return out.map(p => p.name);
};

const QuestLinePokemonForced2Catch = function (): Record<QuestLineNameType, Partial<Record<number, Array<PokemonNameType | PokemonType>>>> {
    const list = Object.fromEntries(App.game.quests.questLines().map(q => [q.name, {}])) as Record<QuestLineNameType, Partial<Record<number, Array<PokemonNameType | PokemonType>>>>;
    list['Tutorial Quests'][6] = ['Pidgey'];
    list['Bill\'s Grandpa Treasure Hunt'][1] = ['Jigglypuff', PokemonType.Normal];
    list['Bill\'s Grandpa Treasure Hunt'][3] = ['Oddish', PokemonType.Grass];
    list['Bill\'s Grandpa Treasure Hunt'][5] = ['Staryu', PokemonType.Water];
    list['Bill\'s Grandpa Treasure Hunt'][7] = ['Growlithe', PokemonType.Fire];
    list['Bill\'s Grandpa Treasure Hunt'][9] = ['Pikachu', PokemonType.Electric];
    list['Bill\'s Grandpa Treasure Hunt'][12] = ['Eevee'];
    list['The Legendary Beasts'][4] = ['Raikou', 'Entei', 'Suicune'];
    list['Eusine\'s Chase'][11] = ['Suicune'];
    list['Whirl Guardian'][10] = ['Lugia'];
    list['Rainbow Guardian'][2] = ['Ho-Oh'];
    list['Unfinished Business'][13] = ['Celebi'];
    list['The Weather Trio'][6] = ['Rayquaza', 'Kyogre', 'Groudon'];
    list['The Eon Duo'][4] = ['Latias', 'Latios'];
    list['The Three Golems'][9] = ['Regirock', 'Regice', 'Registeel'];
    list['Wish Maker'][4] = ['Absol'];
    list['Wish Maker'][9] = ['Jirachi'];
    list['A Meta Discovery'][1] = ['Electrode'];
    list['A Meta Discovery'][2] = ['Groudon'];
    list['A Meta Discovery'][4] = ['Meta Groudon'];
    list['Zero\'s Ambition'][14] = ['Giratina (Altered)'];
    list['Swords of Justice'][22] = ['Cobalion', 'Terrakion', 'Virizion'];
    list['The Legend Awakened'][8] = ['Genesect'];
    list['The Delta Episode'][28] = ['Rayquaza'];
    list['The Delta Episode'][30] = ['Mega Rayquaza'];
    list['The Great Vivillon Hunt!'][0] = [PokemonType.Water];
    list['The Great Vivillon Hunt!'][1] = ['Vivillon (Marine)'];
    list['The Great Vivillon Hunt!'][2] = [PokemonType.Psychic];
    list['The Great Vivillon Hunt!'][3] = ['Vivillon (Modern)'];
    list['The Great Vivillon Hunt!'][4] = [PokemonType.Poison];
    list['The Great Vivillon Hunt!'][5] = ['Vivillon (Jungle)'];
    list['The Great Vivillon Hunt!'][6] = [PokemonType.Dark];
    list['The Great Vivillon Hunt!'][7] = ['Vivillon (Monsoon)'];
    list['The Great Vivillon Hunt!'][8] = [PokemonType.Steel];
    list['The Great Vivillon Hunt!'][9] = ['Vivillon (Tundra)'];
    list['The Great Vivillon Hunt!'][10] = [PokemonType.Fire];
    list['The Great Vivillon Hunt!'][11] = ['Vivillon (Sun)'];
    list['The Great Vivillon Hunt!'][12] = [PokemonType.Fighting];
    list['The Great Vivillon Hunt!'][13] = ['Vivillon (Archipelago)'];
    list['The Great Vivillon Hunt!'][14] = [PokemonType.Ghost];
    list['The Great Vivillon Hunt!'][15] = ['Vivillon (Elegant)'];
    list['The Great Vivillon Hunt!'][16] = [PokemonType.Fairy];
    list['The Great Vivillon Hunt!'][17] = ['Vivillon (Ocean)'];
    list['The Great Vivillon Hunt!'][18] = [PokemonType.Electric];
    list['The Great Vivillon Hunt!'][19] = ['Vivillon (Continental)'];
    list['The Great Vivillon Hunt!'][20] = [PokemonType.Bug];
    list['The Great Vivillon Hunt!'][21] = ['Vivillon (River)'];
    list['The Great Vivillon Hunt!'][22] = [PokemonType.Flying];
    list['The Great Vivillon Hunt!'][23] = ['Vivillon (Polar)'];
    list['The Great Vivillon Hunt!'][24] = [PokemonType.Ground];
    list['The Great Vivillon Hunt!'][25] = ['Vivillon (Sandstorm)'];
    list['The Great Vivillon Hunt!'][26] = [PokemonType.Grass];
    list['The Great Vivillon Hunt!'][27] = ['Vivillon (Garden)'];
    list['The Great Vivillon Hunt!'][28] = [PokemonType.Rock];
    list['The Great Vivillon Hunt!'][29] = ['Vivillon (High Plains)'];
    list['The Great Vivillon Hunt!'][30] = [PokemonType.Dragon];
    list['The Great Vivillon Hunt!'][31] = ['Vivillon (Savanna)'];
    list['The Great Vivillon Hunt!'][32] = [PokemonType.Ice];
    list['The Great Vivillon Hunt!'][33] = ['Vivillon (Icy Snow)'];
    list['The Great Vivillon Hunt!'][34] = [PokemonType.Normal];
    list['The Great Vivillon Hunt!'][35] = ['Vivillon (Poké Ball)'];
    list['Princess Diancie'][0] = [PokemonType.Fairy];
    list['Princess Diancie'][8] = ['Diancie'];
    list['Clash of Ages'][0] = ['Hoopa'];
    list['Clash of Ages'][4] = [PokemonType.Psychic];
    list['Clash of Ages'][6] = ['Hoopa'];
    list['Clash of Ages'][13] = ['Hoopa (Unbound)'];
    list['Ultra Beast Hunt'][4] = ['Nihilego'];
    list['Ultra Beast Hunt'][6] = ['Buzzwole', 'Pheromosa'];
    list['Ultra Beast Hunt'][10] = ['Xurkitree'];
    list['Ultra Beast Hunt'][12] = ['Kartana', 'Celesteela'];
    list['Ultra Beast Hunt'][16] = ['Blacephalon', 'Stakataka'];
    list['Ultra Beast Hunt'][18] = ['Guzzlord'];
    list['Let\'s Go, Meltan!'][2] = ['Ditto'];
    list['Let\'s Go, Meltan!'][3] = [PokemonType.Steel, PokemonType.Electric];
    list['Let\'s Go, Meltan!'][4] = ['Alolan Grimer', 'Slugma', 'Gulpin'];
    list['Let\'s Go, Meltan!'][6] = ['Magnemite', 'Exeggcute'];
    list['Let\'s Go, Meltan!'][7] = ['Drowzee', 'Cubone', 'Scyther'];
    list['Let\'s Go, Meltan!'][8] = ['Kabuto', 'Omanyte'];
    list['Let\'s Go, Meltan!'][9] = ['Anorith', 'Lileep', 'Aerodactyl'];
    list['Let\'s Go, Meltan!'][10] = ['Meltan', 'Melmetal'];
    list['Dr. Splash\'s Research Project'][3] = ['Spoink', 'Voltorb'];
    list['Dr. Splash\'s Research Project'][5] = ['Dwebble', 'Boldore', 'Forretress', 'Golem', 'Steelix'];
    list['Dr. Splash\'s Research Project'][8] = ['Magikarp Saucy Blue'];
    list['Sword and Shield'][19] = ['Zacian (Battle Hero)', 'Zamazenta (Battle Hero)'];
    list['The Dojo\'s Armor'][3] = ['Galarian Slowpoke'];
    list['The Dojo\'s Armor'][12] = ['Kubfu'];
    list['The Dojo\'s Armor'][16] = [PokemonType.Dark, PokemonType.Water];
    list['The Dojo\'s Armor'][17] = ['Urshifu (Single Strike)', 'Urshifu (Rapid Strike)'];
    list['Secrets of the Jungle'][2] = ['Zarude'];
    list['The Crown of Galar'][7] = ['Spectrier', 'Glastrier'];
    list['The Crown of Galar'][9] = ['Calyrex'];
    list['The Birds of the Dyna Tree'][6] = ['Galarian Articuno', 'Galarian Zapdos', 'Galarian Moltres'];
    list['The Ancient Golems'][5] = ['Regirock', 'Regice', 'Registeel'];
    list['The Ancient Golems'][7] = ['Regigigas'];
    list['The Ancient Golems'][9] = ['Regieleki', 'Regidrago'];
    list['How blu mouse?'][0] = ['Marill'];
    list['Mystery of Deoxys'][2] = [PokemonType.Psychic];
    list['Recover the Precious Egg!'][2] = [PokemonType.Water];
    list['Recover the Precious Egg!'][24] = [PokemonType.Fighting];
    list['Recover the Precious Egg!'][25] = ['Manaphy'];
    list['An Unrivaled Power'][1] = [PokemonType.Psychic, PokemonType.Fighting];
    list['Typing some Memories'][1] = [PokemonType.Fighting, PokemonType.Rock, PokemonType.Dark, PokemonType.Fairy];
    list['Typing some Memories'][4] = [PokemonType.Water, PokemonType.Grass, PokemonType.Fire, PokemonType.Electric, PokemonType.Ground, PokemonType.Ice];
    list['Typing some Memories'][18] = [PokemonType.Bug, PokemonType.Flying, PokemonType.Poison, PokemonType.Ghost, PokemonType.Psychic, PokemonType.Steel, PokemonType.Dragon];
    list['Detective Pikachu'][17] = ['Detective Raichu'];
    return list;
};

const QuestIndexHelper = function (input: number | (() => number)): number {
    if ( typeof input === 'function' ) {
        return input();
    } else {
        return input;
    }
};

const RequirementTrivial = function (req: Requirement | undefined, includedPokemon: PokemonNameType[], includedTypes: PokemonType[], cache?: string[]): {0: boolean, 1: string[]} {
    cache = cache ?? [];
    if ( req === undefined ) {
        return {0: true, 1: cache};
    }
    if ( req.option === GameConstants.AchievementOption.less ) {
        // console.log('Option: Less');
        // console.log(req.constructor);
        // console.log(req);
        return {0: true, 1: cache};
    }
    const bulletinBoardTown: Record<GameConstants.BulletinBoards, Town> = {
        [GameConstants.BulletinBoards.None]: TownList['Pallet Town'],
        [GameConstants.BulletinBoards.All]: TownList['Pallet Town'],
        [GameConstants.BulletinBoards.Kanto]: TownList['Pallet Town'],
        [GameConstants.BulletinBoards.Johto]: TownList['New Bark Town'],
        [GameConstants.BulletinBoards.Hoenn]: TownList['Littleroot Town'],
        [GameConstants.BulletinBoards.Sevii4567]: TownList['Pummelo Island'],
        [GameConstants.BulletinBoards.Sinnoh]: TownList['Twinleaf Town'],
        [GameConstants.BulletinBoards.Unova]: TownList['Aspertia City'],
        [GameConstants.BulletinBoards.Kalos]: TownList['Vaniville Town'],
        [GameConstants.BulletinBoards.Alola]: TownList['Professor Kukui\'s Lab'],
        [GameConstants.BulletinBoards.Hoppy]: TownList['Hoppy Town'],
        [GameConstants.BulletinBoards.Galar]: TownList.Postwick,
        [GameConstants.BulletinBoards.Armor]: TownList['Master Dojo'],
        [GameConstants.BulletinBoards.Crown]: TownList.Freezington,
        [GameConstants.BulletinBoards.Hisui]: TownList['Galaxy Hall'],
        [GameConstants.BulletinBoards.Arceus]: TownList['Galaxy Hall'],
        [GameConstants.BulletinBoards.Paldea]: TownList['Cabo Poco'],
    };
    let test1: boolean, test2: boolean, questLineName: QuestLineNameType, questLine: QuestLine, townName: string;
    switch ( req.constructor ) {
        case MultiRequirement:
            return {0: (req as MultiRequirement).requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]), 1: cache};
        case OneFromManyRequirement:
            return {0: (req as OneFromManyRequirement).requirements.some(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]), 1: cache};
        case ObtainedPokemonRequirement:
            return {0: includedPokemon.includes((req as ObtainedPokemonRequirement).pokemon), 1: cache};
        case RouteKillRequirement:
            const route = Routes.getRoute((req as RouteKillRequirement).region, (req as RouteKillRequirement).route);
            if ( cache.includes(route.routeName) ) {
                return {0: true, 1: cache};
            }
            test1 = route.requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test1 ) {
                cache.push(route.routeName);
            }
            return {0: test1, 1: cache};
        case ClearDungeonRequirement:
            const dungeonName = GameConstants.RegionDungeons.flat()[(req as ClearDungeonRequirement).dungeonIndex];
            if ( cache.includes(`Dungeon: ${dungeonName}`) && cache.includes(`Town: ${dungeonName}`) ) {
                return {0: true, 1: cache};
            }
            test1 = RequirementTrivial(dungeonList[dungeonName].optionalParameters.requirement, includedPokemon, includedTypes, cache)[0];
            if ( test1 ) {
                cache.push(`Dungeon: ${dungeonName}`);
            }

            test2 = TownList[dungeonName].requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test2 ) {
                cache.push(`Town: ${dungeonName}`);
            }
            return {0: test1 && test2, 1: cache};
        case GymBadgeRequirement:
            const gymName = Object.keys(GymList).filter(town => GymList[town].badgeReward === (req as GymBadgeRequirement).badge)[0];
            townName = Object.keys(TownList).filter(town => TownList[town].content.filter(v => v instanceof Gym).length)
                .filter(town => TownList[town].content.filter(gym => (gym as Gym).badgeReward === (req as GymBadgeRequirement).badge))[0];
            if ( cache.includes(`Gym: ${gymName}`) && cache.includes(`Town: ${townName}`) ) {
                return {0: true, 1: cache};
            }
            test1 = GymList[gymName].requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test1 ) {
                cache.push(`Gym: ${gymName}`);
            }

            test2 = TownList[townName].requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test2 ) {
                cache.push(`Town: ${townName}`);
            }
            return {0: test1 && test2, 1: cache};
        case TemporaryBattleRequirement:
            const tempBattle = TemporaryBattleList[(req as TemporaryBattleRequirement).battleName];
            townName = tempBattle.getTown()?.name ?? '';
            if ( cache.includes(`TempBattle: ${tempBattle.name}`) && cache.includes(`Town: ${townName}`) ) {
                return {0: true, 1: cache};
            }
            test1 = tempBattle.requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test1 ) {
                cache.push(`TempBattle: ${tempBattle.name}`);
            }

            test2 = (tempBattle.getTown() ? (tempBattle.getTown() as Town).requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]) : true);
            if ( test2 ) {
                cache.push(`Town: ${townName}`);
            }
            return {0: test1 && test2, 1: cache};
        case QuestLineStartedRequirement:
            questLineName = (req as QuestLineStartedRequirement).questLineName;
            questLine = App.game.quests.questLines().filter(q => q.name === questLineName)[0];
            const town = bulletinBoardTown[questLine.bulletinBoard];
            if ( cache.includes(`${questLineName} START`) && cache.includes(`Town: ${town.name}`) ) {
                return {0: true, 1: cache};
            }
            test1 = RequirementTrivial(questLine.requirement, includedPokemon, includedTypes, cache)[0];
            if ( test1 ) {
                cache.push(`${questLineName} START`);
            }

            test2 = town.requirements.every(v => RequirementTrivial(v, includedPokemon, includedTypes, cache)[0]);
            if ( test2 ) {
                cache.push(`Town: ${town.name}`);
            }
            return {0: test1 && test2, 1: cache};
        case QuestLineStepCompletedRequirement:
            const step = QuestIndexHelper((req as QuestLineStepCompletedRequirement).questIndex);
            questLineName = (req as QuestLineStepCompletedRequirement).questLineName;
            if ( cache.includes(`${questLineName} Step ${step}`) ) {
                return {0: true, 1: cache};
            }
            test1 = step > 0 ?
                RequirementTrivial(new QuestLineStepCompletedRequirement(questLineName, step - 1), includedPokemon, includedTypes, cache)[0] :
                RequirementTrivial(new QuestLineStartedRequirement(questLineName), includedPokemon, includedTypes, cache)[0];
            test2 = (QuestLinePokemonForced2Catch()[questLineName][step] ?? []).every(v => {
                if ( typeof v === 'string' ) {
                    return includedPokemon.includes(v);
                } else {
                    return includedTypes.includes(v);
                }
            });
            if ( test1 && test2 ) {
                cache.push(`${questLineName} Step ${step}`);
            }
            return {0: test1 && test2, 1: cache};
        case QuestLineCompletedRequirement:
            questLineName = (req as QuestLineCompletedRequirement).questLineName;
            questLine = App.game.quests.questLines().filter(q => q.name === questLineName)[0];
            if ( cache.includes(`${questLineName} END`) ) {
                return {0: true, 1: cache};
            }
            test1 = RequirementTrivial(new QuestLineStepCompletedRequirement(questLineName, questLine.totalQuests - 1), includedPokemon, includedTypes, cache)[0];
            if ( test1 ) {
                cache.push(`${questLineName} END`);
            }
            return {0: test1, 1: cache};
        case SpecialEventRequirement:
        case DayOfWeekRequirement:
        case PokemonDefeatedSelectNRequirement:
        case MoonCyclePhaseRequirement:
            return {0: true, 1: cache};
        default:
            console.log('Not Implemented');
            console.log(req.constructor);
            console.log(req);
            return {0: false, 1: cache};
    }
};
