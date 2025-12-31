STEVENLAU.StevenlauBot.prototype.veryFirstEntities = function()
{
    // Loop once to cache all entities for analysis
    const entities = {
        women: [],
        crossbowmen: [],
        spearmen: [],
        swordcav: null,
        minister: null,
        cc: null,
        enemyCC: null,
        trees: [],
        fruits: [],
        chickens: [],
        metals: [],
        stones: [],
        meats: []
    };
    this.gameState.getEntities().forEach(ent => {
        const s = ent.genericName();
        if (this.gameState.isEntityOwn(ent)) {
            if (s == "Female Citizen") entities.women.push(ent);
            else if (s == "Infantry Crossbowman") entities.crossbowmen.push(ent);
            else if (s == "Spearman") entities.spearmen.push(ent);
            else if (s == "Cavalry Swordsman") entities.swordcav = ent;
            else if (s == "Imperial Minister") entities.minister = ent;
            else if (s == "Civic Center") entities.cc = cacheStructureCorners(ent);
            else this.chat(`unhandled first own entity: ${s}`);
        } else {
            if (s == "Civic Center") entities.enemyCC = ent;
            else if (s == "Tree") entities.trees.push(ent);
            else if (s == "Fruit") {
              if (ent.resourceSupplyAmount() == 200) entities.fruits.push(ent);
            }
            else if (s == "Chicken") entities.chickens.push(ent);
            else if (s == "Metal Mine") entities.metals.push(ent);
            else if (s == "Stone Quarry") entities.stones.push(ent);
            else if (s == "Red Deer") entities.meats.push(ent);
            else if (s == "Sheep") entities.meats.push(ent);
            else if (ent.resourceSupplyType()) this.chat(`unhandled first entity: ${s}`);
        }
    });
    return entities;
};

function fieldsAround(cc, cosa, sina, obstructs) {
    const e = 10;
    const w = +cc.get("Obstruction/Static/@width");
    const h = +cc.get("Obstruction/Static/@depth");
    const x = w/2 + e;
    const z = 3*e
    return [3*e,e,-e].flatMap(i => [[i,z],[-i,-z],[x,-i],[-x,i]]).map(center => {
        return {
            position: pointRelative(center, cc.position(), cosa, sina),
            corners: rectCorners(center, e, e).map(corner => pointRelative(corner, cc.position(), cosa, sina))
        };
    }).filter(field => obstructs.every(obstruct => rectsDisjoint(obstruct, field.corners)));
}

function housesBarracksAround(cc, cosa, sina, obstructs) {
    const w = +cc.get("Obstruction/Static/@width");
    const h = +cc.get("Obstruction/Static/@depth");
    const x = w/2 + 20;
    const z = 20 + 20;
    const eb = 11;
    const eh = 9;
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

function findStorehouse(bucket, forest, cc) {
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
    candidates.sort((a, b) => a.weight - b.weight);
    return findPlacement(candidates, "preview|structures/han/storehouse");
}

function findPlacement(placements, template) {
    const ent = SimEngine.AddLocalEntity(template);
    const cmpBuildRestrictions = SimEngine.QueryInterface(ent, Sim.IID_BuildRestrictions);
    if (!cmpBuildRestrictions) throw "cmpBuildRestrictions not defined";
    const pos = SimEngine.QueryInterface(ent, Sim.IID_Position);
    pos.SetYRotation(0);
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

function veryFirstMoment(entities, chat) {
            const {women, crossbowmen, spearmen, swordcav, minister, cc, enemyCC} = entities;
    const {trees, fruits, chickens, metals, stones} = entities;

    cacheStructureCorners(cc);
    [...women, ...crossbowmen, ...spearmen, swordcav,
     ...trees, ...fruits, ...chickens, ...metals, ...stones].forEach(ent => {
        ent.ccDist = pointRectDistanceSquared(ent.position(), cc.corners);
    });
    [fruits, chickens, metals, stones].forEach(x => x.sort((a, b) => a.ccDist - b.ccDist));
    fruits.splice(5);
    fruits.forEach(cacheStructureCorners);
    cacheStructureCorners(metals[0]);
    cacheStructureCorners(stones[0]);

    const teleporting = new Map();
    const constructing = new Map();
    const reserves = {};

    // 1. Train 6 women

    cc.train("han", "units/han/support_female_citizen", 6);

    // 2. Swordcav hunt chicken

    chickens.forEach(chicken => chicken.cavDist = API3.SquareVectorDistance(chicken.position(), swordcav.position()));
    const cavChicken = chickens.reduce((m, c) => m.cavDist < c.cavDist ? m : c, chickens[0]);
    if (cavChicken.cavDist < swordcav.ccDist + chickens[0].ccDist) {
        // Walk to chicken nearest to swordcav
        swordcav.gather(cavChicken);
    } else {
        // Teleport to chicken nearest to CC
        swordcav.garrison(cc);
        teleporting.set(swordcav.id(), [swordcav, chickens[0], "gather"]);
    }

    // 2. Assume metal and stone are sole obstructions,
    //    fix less than 12 fields around CC

    const mines = [metals[0].corners, stones[0].corners];
    reserves.fields = fieldsAround(cc, cc.cosa, cc.sina, mines);

    // 3. After fixing fields, quickly classify trees

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
        } else if (reserves.fields.every(field => rectsDisjoint(field.corners, tree.corners))) {
            houseTrees.push(tree);
        } else {
            fieldTrees.push(tree);
        }
    });
    if (fieldTrees.length > 0) {
        // Must clear all field trees to build fields
        entities.baseTrees = fieldTrees.sort((a, b) => a.ccDist - b.ccDist);
    } else {
        // Trees are far away, but we still need one tree for init wood
        entities.baseTrees = [houseTrees.reduce((m, t) => m.ccDist < t.ccDist ? m : t, houseTrees[0])]
        chat(`far tree: ${Math.sqrt(entities.baseTrees[0].ccDist)}`);
    }

    // 4. Assume field trees are cleared, greedy 3 barracks and houses

    Object.assign(reserves, housesBarracksAround(cc, cc.cosa, cc.sina, [...mines, ...houseTrees.map(tree => tree.corners)]));

    // 5. Among the houses, pick best to be farmstead

    reserves.houses.forEach(house => {
        house.fruitDist = Math.min(...fruits.map(fruit => {
            return API3.SquareVectorDistance(fruit.position(), house.position);
        }));
    });
    const farmstead = findPlacement(reserves.houses.sort((a, b) => a.fruitDist - b.fruitDist), "preview|structures/han/farmstead");
    chat(`farmstead ${positionToString(farmstead.position)}`);
    reserves.houses.splice(reserves.houses.findIndex(x => x == farmstead), 1);

    // 6. Women farthest from tree build farmstead and house

    const firstTree = entities.baseTrees[0];
    const workers = [...women, ...crossbowmen, ...spearmen].map(unit => {
        const teleportDist = unit.ccDist + firstTree.ccDist;
        const walkDist = API3.SquareVectorDistance(firstTree.position(), unit.position());
        unit.firstTreeDist = {
            teleport: teleportDist,
            walk: walkDist,
            min: Math.min(teleportDist, walkDist)
        };
        return unit;
    }).sort((a, b) => b.firstTreeDist.min - a.firstTreeDist.min);
    const builders = workers.filter(unit => unit.genericName() == "Female Citizen").slice(0, 2).map(unit => {
        const teleportDist = unit.ccDist + pointRectDistanceSquared(farmstead.position, cc.corners);
        const walkDist = API3.SquareVectorDistance(unit.position(), farmstead.position);
        unit.farmsteadDist = {
            teleport: teleportDist,
            walk: walkDist,
            min: Math.min(teleportDist, walkDist)
        };
        return unit;
    }).sort((a, b) => a.farmsteadDist.min - b.farmsteadDist.min);
    workers.splice(workers.findIndex(x => x == builders[0]), 1);
    workers.splice(workers.findIndex(x => x == builders[1]), 1);
    workers.splice(0, 0, ...builders);

    // builders[0] construct farmstead
    constructing.set("Farmstead", [builders[0]]);
    builders[0].construct("structures/han/farmstead",
                          farmstead.position[0],
                          farmstead.position[1],
                          cc.angle());
    if (builders[0].farmsteadDist.teleport < builders[0].farmsteadDist.walk) {
        builders[0].garrison(cc);
        teleporting.set(builders[0].id(), []);
        // Fill later when foundation is made
    }

    // builders[1] construct house
    constructing.set("House", [builders[1]]);
    const house = findPlacement(reserves.houses, "preview|structures/han/house");
    chat(`house ${positionToString(house.position)}`);
    reserves.houses.splice(reserves.houses.findIndex(x => x == house), 1);
    builders[1].construct("structures/han/house",
                          house.position[0],
                          house.position[1],
                          cc.angle());
    house.teleportDist = builders[1].ccDist + pointRectDistanceSquared(house.position, cc.corners);
    house.walkDist = API3.SquareVectorDistance(builders[1].position(), house.position);
    if (house.teleportDist < house.walkDist) {
        builders[1].garrison(cc);
        teleporting.set(builders[1].id(), []);
        // Fill later when foundation is made
    }

    // 7. Farthest remaining worker go forest then build storehouse

    const {bucket, forests} = clusterForests(moreTrees);
    forests.forEach(forest => {
        forest.ccDist = API3.SquareVectorDistance(forest.position, cc.position());
    });
    const forest = forests.sort((a, b) => a.ccDist - b.ccDist)[0];
    /* chat(forests.map(forest => `${forest.trees.length}(${forest.wood})`).join(" ")); */
    reserves.storehouse = findStorehouse(bucket, forest, cc);
    chat(`storehouse ${positionToString(reserves.storehouse.position)}`);
    forest.trees.forEach(tree => {
        tree.dropDist = API3.SquareVectorDistance(tree.position(), reserves.storehouse.position);
    });
    entities.forestTree = forest.trees.reduce((m, t) => m.dropDist < t.dropDist ? m : t, forest.trees[0]);
    workers[2].treeDist = API3.SquareVectorDistance(workers[2].position(), entities.forestTree.position());
    if (workers[2].ccDist + pointRectDistanceSquared(entities.forestTree.position(), cc.corners) < workers[2].treeDist) {
        workers[2].garrison(cc);
        teleporting.set(workers[2].id(), [workers[2], entities.forestTree, "gather"]);
    } else {
        workers[2].gather(entities.forestTree);
    }

    // 8. Remaining 5 workers cut 50 wood then help storehouse

    workers.slice(3).forEach(unit => {
        if (unit.firstTreeDist.walk < unit.firstTreeDist.teleport) {
            unit.gather(firstTree);
        } else {
            unit.garrison(cc);
            teleporting.set(unit.id(), [unit, firstTree, "gather"]);
        }
    });
    entities.workers = workers;

    // 9. Minister scout

    veryFirstScout(minister, entities.forestTree.position(), cc.position());

    [...reserves.fields, ...reserves.houses, ...reserves.barracks].forEach(x => {
        x.enemyCCDist = API3.SquareVectorDistance(x.position, enemyCC.position());
    });
    [reserves.fields, reserves.houses, reserves.barracks].forEach(x => {
        x.sort((a, b) => b.enemyCCDist - a.enemyCCDist);
    });
    chat([
        `cc: ${positionToString(cc.position())} ${roundDD(cc.angle())}rad`,
        `${roundDD(API3.VectorDistance(cc.position(), enemyCC.position()))} from enemy`
    ].join(", "));
    /* chat([
     *     `${reserves.fields.length} fields`,
     *     `${entities.baseTrees.length} base trees`,
     *     `ignored ${ignoredTrees} trees`
     * ].join(", ")); */

    return {teleporting, constructing, reserves};
}

STEVENLAU.StevenlauBot.prototype.veryFirstConstructing = function()
{
    this.gameState.getOwnFoundations().forEach(foundation => {
        if (foundation.getBuildersNb() > 0) return;
        if (!this.constructing.has(foundation.genericName())) {
            this.chat(`unhandled foundation: ${foundation.genericName()}`);
            return;
        }
        this.constructing.get(foundation.genericName()).forEach(unit => {
            if (this.teleporting.has(unit.id())) {
                this.teleporting.set(unit.id(), [unit, foundation, "repair"]);
            } else {
                unit.repair(foundation, false, false, true);
            }
        });
        this.constructing.delete(foundation.genericName());
    });
    this.constructing.forEach((units, foundation) => {
        this.chat(`missing foundation: ${foundation}`);
    });
};

STEVENLAU.StevenlauBot.prototype.veryFirstTeleporting = function()
{
    for (const id of this.cc.garrisoned()) {
        if (!this.teleporting.has(id)) {
            this.chat(`unknown garrison: ${id}`);
            continue;
        }
        const [unit, target, command] = this.teleporting.get(id);
        this.cc.setRallyPoint(target, command);
        this.cc.unload(id);
        this.teleporting.delete(id);
    }
    return this.teleporting.size == 0;
};

STEVENLAU.StevenlauBot.prototype.veryFirstStorehouse = function()
{
    if (this.workers.length == 8) {
        this.workers[0].gather(this.forestTree, true);
        this.workers[1].gather(this.forestTree, true);
        this.workers.splice(0, 2);
        this.constructing.set("Storehouse", []);
    }
    this.workers.slice(1).filter(unit => {
        const wood = unit.resourceCarrying()?.find(x => x.type == "wood")?.amount || 0;
        const full = wood == 10 || wood < unit.wood;
        // The second case was when worker is super close to CC
        // and he just dropped wood during turn gap.
        unit.wood = wood;
        return full;
    }).forEach(worker => {
        this.constructing.get("Storehouse").push(worker);
        this.workers.splice(this.workers.findIndex(x => x == worker), 1)
        worker.garrison(this.cc);
        this.teleporting.set(worker.id(), [worker, this.forestTree, "gather"]);
    });
    if (this.gameState.getResources().wood < 100) return 0;
    this.workers[0].construct(
        "structures/han/storehouse",
        this.reserves.storehouse.position[0],
        this.reserves.storehouse.position[1],
        0);
    this.constructing.get("Storehouse").push(this.workers[0]);
    return 1.5;
};

STEVENLAU.StevenlauBot.prototype.veryFirstMoments = function()
{
    if (!this.veryFirstMomentsFSM) {
        this.veryFirstState = 0;
        this.veryFirstMomentsFSM = [
            () => {
                const entities = this.veryFirstEntities();
                Object.assign(this, veryFirstMoment(entities, this.chat));
                this.cc = entities.cc;
                this.fruit = entities.fruits[0];
                this.baseTrees = entities.baseTrees;
                this.workers = entities.workers;
                this.forestTree = entities.forestTree;
                return 1.5;
            },
            () => {
                this.veryFirstConstructing();
                return 1;
            },
            () => this.veryFirstTeleporting() * 1.5,
            () => {
                this.veryFirstTeleporting();
                return this.veryFirstStorehouse();
            },
            () => this.veryFirstTeleporting(),
            () => {
                this.veryFirstConstructing();
                return 1;
            },
            () => {
                this.cc.setRallyPoint(this.fruit, "gather");
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
