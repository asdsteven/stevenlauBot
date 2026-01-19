STEVENLAU.StevenlauBot.prototype.veryFirstEntities = function()
{
    // Loop once to cache all entities for analysis
    const entities = {
        cav: null,
        rangeds: [],
        melees: [],
        women: [],
        cc: null,
        minister: null,
        enemyCC: null,
        metals: [],
        stones: [],
        trees: [],
        fruits: [],
        meats: []
    };
    this.gameState.getEntities().forEach(ent => {
        if (this.gameState.isEntityOwn(ent)) {
            if (ent.hasClass("Cavalry")) entities.cav = ent;
            else if (ent.hasClass("Ranged")) entities.rangeds.push(ent);
            else if (ent.hasClass("Melee")) entities.melees.push(ent);
            else if (ent.genericName() == "Female Citizen") entities.women.push(ent);
            else if (ent.genericName() == "Civic Center") entities.cc = cacheStructureCorners(ent);
            else if (ent.genericName() == "Imperial Minister") entities.minister = ent;
            else this.chat(`unhandled very first entity: ${s}`);
        } else {
            if (ent.genericName() == "Civic Center") entities.enemyCC = ent;
            else if (ent.resourceSupplyType()?.generic == "metal") entities.metals.push(ent);
            else if (ent.resourceSupplyType()?.generic == "stone") entities.stones.push(ent);
            else if (ent.resourceSupplyType()?.specific == "tree") entities.trees.push(ent);
            else if (ent.resourceSupplyType()?.specific == "fruit") entities.fruits.push(ent);
            else if (ent.resourceSupplyType()?.specific == "meat") entities.meats.push(ent);
        }
    });
    return entities;
};

function hanFieldsAround(cc, cosa, sina, obstructs) {
    const e = 9; // half field width
    const w = +cc.get("Obstruction/Static/@width");
    /* const h = +cc.get("Obstruction/Static/@depth"); */
    const x = w/2 + e;
    const z = 3*e
    return [3*e,e,-e].flatMap(i => [[i,z],[-i,-z],[x,-i],[-x,i]]).map(center => {
        return {
            position: pointRelative(center, cc.position(), cosa, sina),
            corners: rectCorners(center, e, e).map(corner => pointRelative(corner, cc.position(), cosa, sina))
        };
    }).filter(field => obstructs.every(obstruct => rectsDisjoint(obstruct, field.corners)));
}

function hanHousesBarracksAround(cc, cosa, sina, obstructs) {
    const w = +cc.get("Obstruction/Static/@width");
    /* const h = +cc.get("Obstruction/Static/@depth"); */
    const x = w/2 + 18; // +field
    const z = 18 + 18;  // +2field
    const eb = 10; // half barrack width
    const eh = 8; // half house width
    const houses = [];
    const barracks = [];
    [[x,z,-1,0],[-x,z,0,-1],[-x,-z,1,0],[x,-z,0,1]].forEach(([x,z,dx,dz]) => {
        let xx = x;
        let zz = z;
        while (Math.abs(xx) <= Math.abs(x) && Math.abs(zz) <= Math.abs(z)) {
            if (barracks.length < 3) {
                const center = [xx + dx*eb + dz*eb, zz - dx*eb + dz*eb];
                const corners = rectCorners(center, eb, eb).map(corner => pointRelative(corner, cc.position(), cosa, sina));
                if (obstructs.every(obstruct => rectsDisjoint(obstruct, corners))) {
                    barracks.push({
                        position: pointRelative(center, cc.position(), cosa, sina),
                        corners: corners
                    });
                    xx += dx*eb*2;
                    zz += dz*eb*2;
                    continue;
                }
            }
            const center = [xx + dx*eh + dz*eh, zz - dx*eh + dz*eh];
            const corners = rectCorners(center, eh, eh).map(corner => pointRelative(corner, cc.position(), cosa, sina));
            if (obstructs.every(obstruct => rectsDisjoint(obstruct, corners))) {
                houses.push({
                    position: pointRelative(center, cc.position(), cosa, sina),
                    corners: corners
                });
                xx += dx*eh*2;
                zz += dz*eh*2;
                continue;
            }
            xx += dx*eh*2;
            zz += dz*eh*2;
        }
    });
    return {
        houses: houses,
        barracks: barracks
    };
}

function veryFirstStorehouses(bucket, forest, cc) {
    const [x, z] = [Math.round(forest.position[0] / 20), Math.round(forest.position[1] / 20)];
    const candidates = [];
    const weight = pos => {
        const ccDist = API3.SquareVectorDistance(pos, cc.position());
        const forestDist = API3.SquareVectorDistance(pos, forest.position);
        return ccDist + 50 * forestDist;
    };
    for (let i = Math.max(0, x - 10); i <= x + 10; i++) {
        for (let j = Math.max(0, z - 10); j <= z + 10; j++) {
            const key = i * 1000 + j;
            if (bucket.has(key)) continue;
            const pos = [i * 20 + 10, j * 20 + 10];
            if (API3.SquareVectorDistance(pos, cc.position()) > 130*130) continue;
            candidates.push({
                position: pos,
                weight: weight(pos)
            });
        }
    }
    return candidates.sort(by(x => x.weight));
}

function findPlacement(placements, template, angle) {
    const ent = SimEngine.AddEntity(template);
    const cmpBuildRestrictions = SimEngine.QueryInterface(ent, Sim.IID_BuildRestrictions);
    if (!cmpBuildRestrictions) throw "cmpBuildRestrictions not defined";
    const pos = SimEngine.QueryInterface(ent, Sim.IID_Position);
    pos.SetYRotation(angle);
    for (const placement of placements) {
        pos.JumpTo(placement.position[0], placement.position[1]);
        /* unknown error dunno why */
	/* const result = cmpBuildRestrictions.CheckPlacement(); */
        /* if (result.success) return c; */
        /* chat(sanitize(JSON.stringify(result))); */
        const x = SimEngine.QueryInterface(ent, Sim.IID_Obstruction);
        const result = x.CheckFoundation("building-land", false);
        if (result == "success") {
            SimEngine.DestroyEntity(ent);
            return placement;
        }
    }
    SimEngine.DestroyEntity(ent);
    throw `${template} not found`;
}

function veryFirstScout(minister, [x, z], [xx, zz]) {
    const rad = Math.atan2(z - zz, x - xx);
    for (let i = 1; i <= 12; i++) {
        // Bug in vector.js: rotate was actually clockwise, not anti-clockwise.
        // I negate the angle to ducktape it.
        const v = new Vector2D(xx, zz).add(new Vector2D(130, 0).rotate(-rad - i * 2 * Math.PI / 12));
        minister.move(v.x, v.y, true);
    }
}

function veryFirstMoment(entities, chat, postCommand, applyCiv) {
    const {cav, rangeds, melees, women, cc, minister, enemyCC} = entities;
    const {trees, fruits, meats, metals, stones} = entities;

    cacheStructureCorners(cc);
    const cacheCCDist = x => x.ccDist = pointRectDistanceSquared(x.position(), cc.corners);
    [cav, ...rangeds, ...melees, ...women,
     ...trees, ...fruits, ...meats, ...metals, ...stones].forEach(cacheCCDist);
    fruits.splice(fruits.filter(x => x.ccDist < 250*250).length);
    [fruits, meats, metals, stones].forEach(x => x.sort(by(x => x.ccDist)));
    [ ...fruits, metals[0], stones[0]].forEach(cacheStructureCorners);

    const teleportings = new Map();
    const constructings = new Map();
    const reserves = {};

    // 1. Train 6 women

    cc.train(applyCiv("{civ}"), applyCiv("units/{civ}/support_female_citizen"), 6);

    // 2. Cav hunt

    const cacheCavDist = x => x.cavDist = API3.SquareVectorDistance(x.position(), cav.position());
    meats.forEach(cacheCavDist);
    const cavMeat = minArg(x => x.cavDist, meats);
    if (cavMeat.cavDist < cav.ccDist + meats[0].ccDist) {
        // Walk to cavMeat - meat nearest to swordcav
        cav.gather(cavMeat);
    } else {
        // Teleport to meat[0] - meat nearest to CC
        cav.garrison(cc);
        teleportings.set(cav.id(), [meats[0], "gather"]);
    }

    // 3. Assume metal and stone are sole obstructions,
    //    reserve fields around CC

    const mineCorners = [metals[0].corners, stones[0].corners];
    reserves.fields = hanFieldsAround(cc, cc.cosa, cc.sina, mineCorners);

    // 4. After reserving fields, quickly classify trees

    const fieldTrees = [];
    const houseTrees = [];
    let ignoredTrees = 0;
    const outerTrees = [];
    entities.trees.forEach(tree => {
        if (tree.ccDist > 250*250) {
            ignoredTrees++;
            return;
        }
        if (tree.ccDist > 7000) {
            outerTrees.push(tree);
            return;
        }
        cacheStructureCorners(tree);
        if (tree.ccDist > 3000) {
            houseTrees.push(tree);
        } else if (reserves.fields.every(x => rectsDisjoint(x.corners, tree.corners))) {
            houseTrees.push(tree);
        } else {
            fieldTrees.push(tree);
        }
    });
    if (fieldTrees.length > 0) {
        // Must clear all field trees to build fields
        entities.baseTrees = fieldTrees.sort(by(x => x.ccDist));
    } else {
        // Trees are far away, but we still need one tree for init wood
        entities.baseTrees = [minArg(x => x.ccDist, houseTrees)]
        chat(`far tree: ${Math.sqrt(entities.baseTrees[0].ccDist)}`);
    }

    // 5. Assume field trees are cleared, reserve 3 barracks and houses

    const houseObstructs = [...mineCorners, ...houseTrees.map(x => x.corners)];
    const {houses, barracks} = hanHousesBarracksAround(cc, cc.cosa, cc.sina, houseObstructs);
    reserves.houses = houses;
    reserves.barracks = barracks;
    const cacheEnemyCCDist = x => x.enemyCCDist = API3.SquareVectorDistance(x.position, enemyCC.position());
    [...reserves.fields, ...reserves.houses, ...reserves.barracks].forEach(cacheEnemyCCDist);
    [reserves.fields, reserves.houses, reserves.barracks].forEach(x => x.sort(by(x => -x.enemyCCDist)));

    // 6. Cut base trees is top priority.
    //    Three worst workers build farmstead, house, and forest storehouse.

    const workers = [...women, ...rangeds, ...melees].map(unit => {
        unit.baseTreeTeleport = unit.ccDist + entities.baseTrees[0].ccDist;
        const unitDist = x => x.unitDist = API3.SquareVectorDistance(x.position(), unit.position());
        unit.baseTree = minArg(x => x.unitDist, entities.baseTrees.map(unitDist));
        unit.baseTreeWalk = unit.baseTree.unitDist;
        unit.baseTreeDist = Math.min(unit.baseTreeTeleport, unit.baseTreeWalk);
        return unit;
    }).sort(by(x => -x.baseTreeDist));

    // Change the house with best fruit rate to farmstead
    const farmsteads = reserves.houses.map(house => {
        const houseDist = fruit => API3.SquareVectorDistance(fruit.position(), house.position);
        const rate = fruit => fruit.resourceSupplyAmount() / houseDist(fruit);
        house.fruitRate = sum(fruits.map(rate));
        return house;
    }).sort(by(x => -x.fruitRate));
    const farmstead = findPlacement(farmsteads, applyCiv("foundation|structures/{civ}/farmstead"), cc.angle());
    arrayRemove(farmstead, reserves.houses);

    // Among 3 worst workers, find best one to build farmstead.
    const builders = workers.splice(0, 3).map(unit => {
    unit.farmsteadTeleport = unit.ccDist + pointRectDistanceSquared(farmstead.position, cc.corners);
        unit.farmsteadWalk = API3.SquareVectorDistance(unit.position(), farmstead.position);
        unit.farmsteadDist = Math.min(unit.farmsteadTeleport, unit.farmsteadWalk)
        return unit;
    });
    const farmsteadBuilder = minArg(x => x.farmsteadDist, builders);
    arrayRemove(farmsteadBuilder, builders);

    postCommand({
	"type": "construct",
	"entities": [farmsteadBuilder.id()],
	"template": applyCiv("structures/{civ}/farmstead"),
	"x": farmstead.position[0],
	"z": farmstead.position[1],
	"angle": cc.angle(),
	"autorepair": true,
	"autocontinue": false,
	"queued": false,
	"pushFront": false
    });
    if (farmsteadBuilder.farmsteadTeleport < farmsteadBuilder.farmsteadWalk) {
        farmsteadBuilder.garrison(cc);
        const teleport = foundation => teleportings.set(farmsteadBuilder.id(), [foundation, "repair"]);
        constructings.set("Farmstead", teleport);
    }

    // Among 2 remaining worst workers, find best one to build house.
    const house = findPlacement(reserves.houses, applyCiv("foundation|structures/{civ}/house"), cc.angle());
    arrayRemove(house, reserves.houses);

    builders.map(unit => {
        unit.houseTeleport = unit.ccDist + pointRectDistanceSquared(house.position, cc.corners);
        unit.houseWalk = API3.SquareVectorDistance(unit.position(), house.position);
        unit.houseDist = Math.min(unit.houseTeleport, unit.houseWalk);
        return unit;
    });
    const houseBuilder = minArg(x => x.houseDist, builders);
    arrayRemove(houseBuilder, builders);

    postCommand({
	"type": "construct",
	"entities": [houseBuilder.id()],
	"template": applyCiv("structures/{civ}/house"),
	"x": house.position[0],
	"z": house.position[1],
	"angle": cc.angle(),
	"autorepair": true,
	"autocontinue": false,
	"queued": false,
	"pushFront": false
    });
    if (houseBuilder.houseTeleport < houseBuilder.houseWalk) {
        houseBuilder.garrison(cc);
        const teleport = foundation => teleportings.set(houseBuilder.id(), [foundation, "repair"]);
        constructings.set("House", teleport);
    }

    // The remaining worker build forest storehouse.
    const {bucket, forests} = clusterForests(outerTrees);
    forests.forEach(x => x.ccDist = API3.SquareVectorDistance(x.position, cc.position()));
    const firstForest = minArg(x => x.ccDist, forests);

    reserves.storehouses = veryFirstStorehouses(bucket, firstForest, cc);
    reserves.storehouse = findPlacement(reserves.storehouses, applyCiv("foundation|structures/{civ}/storehouse"), 0);

    firstForest.trees.forEach(x => x.dropDist = API3.SquareVectorDistance(x.position(), reserves.storehouse.position));
    const forestTree = minArg(x => x.dropDist, firstForest.trees);

    const storehouseBuilder = builders[0];
    storehouseBuilder.teleportDist = storehouseBuilder.ccDist + pointRectDistanceSquared(forestTree.position(), cc.corners);
    storehouseBuilder.walkDist = API3.SquareVectorDistance(storehouseBuilder.position(), forestTree.position());
    if (storehouseBuilder.teleportDist < storehouseBuilder.walkDist) {
        storehouseBuilder.garrison(cc);
        teleportings.set(storehouseBuilder.id(), [forestTree, "gather"]);
    } else {
        storehouseBuilder.gather(forestTree);
    }

    // 7. Remaining 3 women 2 soldiers cut base tree

    workers.forEach(unit => {
        if (unit.baseTreeWalk < unit.baseTreeTeleport) {
            unit.gather(unit.baseTree);
        } else {
            unit.garrison(cc);
            teleportings.set(unit.id(), [entities.baseTrees[0], "gather"]);
        }
    });

    entities.farmsteadBuilder = farmsteadBuilder;
    entities.houseBuilder = houseBuilder;
    entities.storehouseBuilder = storehouseBuilder;
    entities.workers = workers;
    entities.fruits = fruits;
    entities.forestTree = forestTree;

    // 8. Minister scout

    veryFirstScout(minister, entities.forestTree.position(), cc.position());

    chat([
        `cc at ${positionToString(cc.position())} ${roundDD(cc.angle())}rad`,
        `${roundDD(API3.VectorDistance(cc.position(), enemyCC.position()))} from enemy`,
        `${fieldTrees.length} field trees`
    ].join(" | "));
    return {teleportings, constructings, reserves};
}

STEVENLAU.StevenlauBot.prototype.veryFirstMoments = function()
{
    if (!this.veryFirstMomentsFSM) {
        this.veryFirstState = 0;
        this.veryFirstMomentsFSM = [
            () => {
                this.entities = this.veryFirstEntities();
                const {teleportings, constructings, reserves} = veryFirstMoment(
                    this.entities,
                    x => this.chat(x),
                    x => Engine.PostCommand(this.gameState.getPlayerID(), x),
                    x => this.gameState.applyCiv(x)
                );
                this.teleportings = teleportings;
                this.constructings = constructings;
                this.reserves = reserves;
                return 1.5;
            },
            () => {
                this.gameState.getOwnFoundations().forEach(foundation => {
                    const s = foundation.genericName();
                    if (!this.constructings.has(s)) return;
                    this.constructings.get(s)(foundation);
                    this.constructings.delete(s);
                });
                this.constructings.forEach((handler, name) => this.chat(`foundation not found: ${name}`));
                return this.constructings.size == 0;
            },
            () => {
                for (const id of this.entities.cc.garrisoned()) {
                    if (!this.teleportings.has(id)) {
                        this.chat(`unknown garrison: ${id}`);
                        continue;
                    }
                    const [target, command] = this.teleportings.get(id);
                    this.entities.cc.setRallyPoint(target, command);
                    this.entities.cc.unload(id);
                    this.teleportings.delete(id);
                }
                return this.teleportings.size == 0;
            },
            () => {
                this.entities.farmsteadBuilder.gather(this.entities.forestTree, true);
                this.entities.houseBuilder.gather(this.entities.forestTree, true);
                this.entities.cc.setRallyPoint(this.entities.fruits[0], "gather");
                return 1;
            },
            () => {
                if (this.gameState.getResources().wood < 100) return 0;
                Engine.PostCommand(this.gameState.getPlayerID(), {
	            "type": "construct",
	            "entities": [this.entities.storehouseBuilder.id()],
	            "template": this.gameState.applyCiv("structures/{civ}/storehouse"),
	            "x": this.reserves.storehouse.position[0],
	            "z": this.reserves.storehouse.position[1],
	            "angle": 0,
	            "autorepair": true,
	            "autocontinue": true,
	            "queued": false,
	            "pushFront": false
                });
                return null;
            }
        ];
    }
    while (true) {
        const x = this.veryFirstMomentsFSM[this.veryFirstState]();
        if (x === null) return 1;
        if (x == 0) return 0;
        this.veryFirstState += Math.floor(x);
        if (x > 1) return 0;
    }
};
