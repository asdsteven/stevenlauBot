STEVENLAU.StevenlauBot.prototype.debug = function(s)
{
    this.chat(s);
}

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

function findStorehouse(bucket, forest, cc, template) {
    const [x, z] = [Math.round(forest.position[0] / 20), Math.round(forest.position[1] / 20)];
    const candidates = [];
    const weight = pos => {
        return API3.SquareVectorDistance(pos, cc.position()) + 50 * API3.SquareVectorDistance(pos, forest.position);
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
    candidates.sort(by(x => x.weight));
    return findPlacement(candidates, template, 0);
}

function findPlacement(placements, template, angle) {
    const ent = SimEngine.AddEntity(template);
    const cmpBuildRestrictions = SimEngine.QueryInterface(ent, Sim.IID_BuildRestrictions);
    if (!cmpBuildRestrictions) throw "cmpBuildRestrictions not defined";
    const pos = SimEngine.QueryInterface(ent, Sim.IID_Position);
    pos.SetYRotation(angle);
    for (const placement of placements) {
        pos.JumpTo(placement.position[0], placement.position[1]);
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

function pickFarmstead(houses, fruits, template, angle) {
    houses.forEach(house => {
        house.fruitDist = Math.min(...fruits.map(fruit => {
            return API3.SquareVectorDistance(fruit.position(), house.position);
        }));
    });
    houses.sort(by(x => x.fruitDist));
    return findPlacement(houses, template, angle);
}

function veryFirstMoment(entities, chat, postCommand, applyCiv) {
    const {cav, rangeds, melees, women, cc, minister, enemyCC} = entities;
    const {trees, fruits, meats, metals, stones} = entities;

    cacheStructureCorners(cc);
    [cav, ...rangeds, ...melees, ...women,
     ...trees, ...fruits, ...meats, ...metals, ...stones].forEach(ent => {
         ent.ccDist = pointRectDistanceSquared(ent.position(), cc.corners);
    });
    fruits.splice(fruits.filter(x => x.ccDist < 250*250).length);
    [fruits, meats, metals, stones].forEach(x => x.sort(by(x => x.ccDist)));
    fruits.forEach(cacheStructureCorners);
    cacheStructureCorners(metals[0]);
    cacheStructureCorners(stones[0]);

    const teleportings = new Map();
    const constructings = new Map();
    const reserves = {};

    // 1. Train 6 women

    cc.train(applyCiv("{civ}"), applyCiv("units/{civ}/support_female_citizen"), 6);

    // 2. Cav hunt

    meats.forEach(x => x.cavDist = API3.SquareVectorDistance(x.position(), cav.position()));
    const cavMeat = minArg(x => x.cavDist, meats);
    if (cavMeat.cavDist < cav.ccDist + meats[0].ccDist) {
        // Walk to meat nearest to swordcav
        cav.gather(cavMeat);
    } else {
        // Teleport to meat nearest to CC
        cav.garrison(cc);
        teleportings.set(cav.id(), [cav, meats[0], "gather"]);
    }

    // 3. Assume metal and stone are sole obstructions,
    //    reserve fields around CC

    const mineCorners = [metals[0].corners, stones[0].corners];
    reserves.fields = hanFieldsAround(cc, cc.cosa, cc.sina, mineCorners);

    // 4. After reserving fields, quickly classify trees

    const fieldTrees = [];
    const houseTrees = [];
    let ignoredTrees = 0;
    const moreTrees = [];
    entities.trees.forEach(tree => {
        if (tree.ccDist > 250*250) {
            ignoredTrees++;
            return;
        }
        if (tree.ccDist > 7000) {
            moreTrees.push(tree);
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

    const {houses, barracks} = hanHousesBarracksAround(cc, cc.cosa, cc.sina, [...mineCorners, ...houseTrees.map(x => x.corners)]);
    reserves.houses = houses;
    reserves.barracks = barracks;
    [...reserves.fields, ...reserves.houses, ...reserves.barracks].forEach(x => {
        x.enemyCCDist = API3.SquareVectorDistance(x.position, enemyCC.position());
    });
    [reserves.fields, reserves.houses, reserves.barracks].forEach(x => x.sort(by(x => -x.enemyCCDist)));

    // 6. Cut first tree is top priority.
    //    Three worst workers build farmstead, house, and forest storehouse.

    const firstTree = entities.baseTrees[0];
    const workers = [...women, ...rangeds, ...melees].map(unit => {
        unit.firstTreeTeleport = unit.ccDist + firstTree.ccDist;
        unit.firstTreeWalk = API3.SquareVectorDistance(unit.position(), firstTree.position());
        unit.firstTreeDist = Math.min(unit.firstTreeTeleport, unit.firstTreeWalk);
        return unit;
    }).sort(by(x => -x.firstTreeDist));

    // Among 3 worst workers, find best one to build farmstead.
    const farmstead = pickFarmstead(reserves.houses, fruits, applyCiv("foundation|structures/{civ}/farmstead"), cc.angle());
    arrayRemove(farmstead, reserves.houses);
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
        teleportings.set(farmsteadBuilder.id(), [farmsteadBuilder, "Farmstead", "repair"]);
    }
    constructings.set("Farmstead", [[farmsteadBuilder], () => {
        // For completeness only.  Should not run.
        const farmstead = pickFarmstead(reserves.houses, fruits, applyCiv("foundation|structures/{civ}/farmstead"), cc.angle());
        arrayRemove(farmstead, reserves.houses);
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
    }]);

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
        teleportings.set(houseBuilder.id(), [houseBuilder, "House", "repair"]);
    }
    constructings.set("House", [[houseBuilder], () => {
        // For completeness only.  Should not run.
        const house = findPlacement(reserves.houses, applyCiv("foundation|structures/{civ}/house"), cc.angle());
        arrayRemove(house, reserves.houses);
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
    }]);

    // The other worker build forest storehouse.
    const {bucket, forests} = clusterForests(moreTrees);
    forests.forEach(x => x.ccDist = API3.SquareVectorDistance(x.position, cc.position()));
    const forest = minArg(x => x.ccDist, forests);
    reserves.storehouse = findStorehouse(bucket, forest, cc, applyCiv("foundation|structures/{civ}/storehouse"));
    forest.trees.forEach(x => x.dropDist = API3.SquareVectorDistance(x.position(), reserves.storehouse.position));
    const forestTree = minArg(x => x.dropDist, forest.trees);
    const storehouseBuilder = builders[0];
    storehouseBuilder.teleportDist = storehouseBuilder.ccDist + pointRectDistanceSquared(forestTree.position(), cc.corners);
    storehouseBuilder.walkDist = API3.SquareVectorDistance(storehouseBuilder.position(), forestTree.position());
    if (storehouseBuilder.teleportDist < storehouseBuilder.walkDist) {
        storehouseBuilder.garrison(cc);
        teleportings.set(storehouseBuilder.id(), [storehouseBuilder, forestTree, "gather"]);
    } else {
        storehouseBuilder.gather(forestTree);
    }

    // 7. Remaining 3 women 2 soldiers cut 50 wood then help storehouse

    workers.forEach(unit => {
        if (unit.firstTreeWalk < unit.firstTreeTeleport) {
            unit.gather(firstTree);
        } else {
            unit.garrison(cc);
            teleportings.set(unit.id(), [unit, firstTree, "gather"]);
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
        `cc: ${positionToString(cc.position())} ${roundDD(cc.angle())}rad`,
        `${roundDD(API3.VectorDistance(cc.position(), enemyCC.position()))} from enemy`,
        `${fieldTrees.length} field trees`
    ].join(", "));
    return {teleportings, constructings, reserves};
}

STEVENLAU.StevenlauBot.prototype.veryFirstConstructing = function()
{
    this.chat(`constructings ${Array.from(this.constructings.keys())}`);
    this.gameState.getOwnFoundations().forEach(foundation => {
        this.chat(`foundation ${foundation.genericName()}`);
        if (!this.constructings.has(foundation.genericName())) {
            if (foundation.getBuildersNb() == 0) {
                this.chat(`possibly unhandled foundation: ${foundation.genericName()}, ${Array.from(this.constructings.keys())}`);
            }
            return;
        }
        this.constructings.get(foundation.genericName())[0].forEach(unit => {
            if (this.teleportings.has(unit.id())) {
                this.teleportings.set(unit.id(), [unit, foundation, "repair"]);
            } else {
                this.chat(`${unit.genericName()} repair ${foundation.genericName()}`);
                unit.repair(foundation, true);
            }
        });
        this.constructings.delete(foundation.genericName());
    });
    this.constructings.forEach(([units, onError]) => onError());
    return this.constructings.size == 0;
};

STEVENLAU.StevenlauBot.prototype.veryFirstTeleporting = function()
{
    for (const id of this.entities.cc.garrisoned()) {
        if (!this.teleportings.has(id)) {
            this.chat(`unknown garrison: ${id}`);
            continue;
        }
        const [unit, target, command] = this.teleportings.get(id);
        this.entities.cc.setRallyPoint(target, command);
        this.entities.cc.unload(id);
        this.teleportings.delete(id);
    }
    return this.teleportings.size == 0;
};

STEVENLAU.StevenlauBot.prototype.veryFirstStorehouse = function()
{
    this.entities.workers.filter(unit => {
        if (unit.fulled) return false;
        const wood = unit.resourceCarrying()?.find(x => x.type == "wood")?.amount || 0;
        const full = wood == 10 || wood < unit.wood;
        // The second case was when worker is super close to CC
        // and he just dropped wood during turn gap.
        unit.wood = wood;
        unit.fulled = full;
        return full;
    }).forEach(worker => {
        worker.garrison(this.entities.cc);
        this.teleportings.set(worker.id(), [worker, this.entities.forestTree, "gather"]);
    });
    if (this.gameState.getResources().wood < 100) return 0;
    this.entities.farmsteadBuilder.gather(this.entities.forestTree, true);
    this.entities.houseBuilder.gather(this.entities.forestTree, true);
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
    this.constructings.set("Storehouse", [[this.entities.storehouseBuilder, ...this.entities.workers], () => {
        this.chat("on error");
    }]);
    return 1.5;
};

STEVENLAU.StevenlauBot.prototype.veryFirstMoments = function()
{
    if (!this.veryFirstMomentsFSM) {
        this.veryFirstState = 0;
        this.veryFirstMomentsFSM = [
            () => {
                this.chat("FSM very first");
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
            () => this.veryFirstConstructing(),
            () => this.veryFirstTeleporting(),
            () => {
                this.chat("FSM very first forest tree");
                this.entities.farmsteadBuilder.gather(this.entities.forestTree, true);
                this.entities.houseBuilder.gather(this.entities.forestTree, true);
                return 1.5;
            },
            () => {
                this.veryFirstTeleporting();
                return this.veryFirstStorehouse();
            },
            () => this.veryFirstTeleporting(),
            () => this.veryFirstConstructing(),
            () => {
                this.chat(`FSM very first gather fruit ${this.entities.fruits.length}`);
                this.entities.cc.setRallyPoint(this.entities.fruits[0], "gather");
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
