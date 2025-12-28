Engine.IncludeModule("common-api");

var STEVENLAU = {};

STEVENLAU.StevenlauBot = function(settings)
{
    API3.BaseAI.call(this, settings);
};

STEVENLAU.StevenlauBot.prototype = Object.create(API3.BaseAI.prototype);

STEVENLAU.StevenlauBot.prototype.CustomInit = function(gameState)
{
    this.state = 0;
};

STEVENLAU.StevenlauBot.prototype.printGenericNames = function() {
    const genericNames = new Map();
    this.gameState.getEntities().forEach(ent => {
        const name = ent.genericName();
        genericNames.set(name, (genericNames.get(name) || 0) + 1);
    });
    genericNames.forEach(([name, count]) => this.chat(`${name}: ${count}`));
};

function sanitize(s) {
    return s.replace(/[\[\]]/g, '\\$&');
}

function roundDD(x) {
    return Math.round(x * 100) / 100;
}

function positionToString([x, z]) {
    return `(${roundDD(x)},${roundDD(z)})`;
}

function rectCorners([x, z], w, h) {
    return [[x+w,z+h],[x-w,z+h],[x-w,z-h],[x+w,z-h]];
}

function rectSides(c) {
    return [[c[0],c[1]],[c[1],c[2]],[c[2],c[3]],[c[3],c[0]]];
}

function pointSegmentDistanceSquared(target, p1, p2) {
    const o = new Vector2D(...p1);
    const u = new Vector2D(...target).sub(o);
    const v = new Vector2D(...p2).sub(o);
    const t = u.dot(v) / v.lengthSquared();
    if (t <= 0) return u.lengthSquared();
    if (1 <= t) return u.distanceToSquared(v);
    return u.distanceToSquared(v.mult(t));
}

function pointRectDistanceSquared(target, corners) {
    return Math.min(...(rectSides(corners).map(([p1, p2]) => {
        return pointSegmentDistanceSquared(target, p1, p2);
    })));
}

// Rotation is clockwise (weird)
function pointRelative([dx, dz], [x, z], cosa, sina) {
    return [
        x + cosa * dx + sina * dz,
        z - sina * dx + cosa * dz
    ];
}

function structureCorners(structure, cosa, sina) {
    const w = +structure.get("Obstruction/Static/@width");
    const h = +structure.get("Obstruction/Static/@depth");
    return rectCorners([0, 0], w/2, h/2).map(p => pointRelative(p, structure.position(), cosa, sina));
}

function cacheStructureCorners(structure) {
    structure.cosa = Math.cos(structure.angle());
    structure.sina = Math.sin(structure.angle());
    structure.corners = structureCorners(structure, structure.cosa, structure.sina);
    return structure;
}

function pointInRect(target, corners) {
    return rectSides(corners).every(([p1, p2]) => {
        const u = new Vector2D(...p2).sub(new Vector2D(...p1));
        const v = new Vector2D(...target).sub(new Vector2D(...p1));
        return u.cross(v) >= 0;
    });
}

function rectsDisjoint(corners1, corners2) {
    const normals = [corners1, corners2].flatMap(corners => rectSides(corners).map(([p1, p2]) => {
        return new Vector2D(...p2).sub(new Vector2D(...p1)).perpendicular();
    }));
    return normals.some(normal => {
        const t1s = corners1.map(p => new Vector2D(...p).dot(normal));
        const t2s = corners2.map(p => new Vector2D(...p).dot(normal));
        const [l1, r1] = [Math.min(...t1s), Math.max(...t1s)];
        const [l2, r2] = [Math.min(...t2s), Math.max(...t2s)];
        return r1 <= l2 || r2 <= l1;
    });
}

function fieldsAround(cc, cosa, sina, obstructs) {
    const w = +cc.get("Obstruction/Static/@width");
    const h = +cc.get("Obstruction/Static/@depth");
    const x = w/2 + Math.max(0, (36 - w) / 2) + 9;
    const z = h/2 + Math.max(0, (36 - h) / 2) + 9;
    return [27,9,-9].flatMap(i => [[i,z],[-i,-z],[x,-i],[-x,i]]).map(center => {
        return {
            position: pointRelative(center, cc.position(), cosa, sina),
            corners: rectCorners(center, 9, 9).map(corner => pointRelative(corner, cc.position(), cosa, sina))
        };
    }).filter(field => obstructs.every(obstruct => rectsDisjoint(obstruct, field.corners)));
}

function housesBarracksAround(cc, cosa, sina, obstructs) {
    const w = +cc.get("Obstruction/Static/@width");
    const h = +cc.get("Obstruction/Static/@depth");
    const x = w/2 + Math.max(0, (36 - w) / 2) + 18;
    const z = h/2 + Math.max(0, (36 - h) / 2) + 18;
    const houses = [];
    const barracks = [];
    [[x,z,-1,0],[-x,z,0,-1],[-x,-z,1,0],[x,-z,0,1]].forEach(([x,z,dx,dz]) => {
        let xx = x;
        let zz = z;
        while (Math.abs(xx) <= Math.abs(x) && Math.abs(zz) <= Math.abs(z)) {
            if (barracks.length < 3) {
                const center = [xx + dx*10 + dz*10, zz - dx*10 + dz*10];
                const corners = rectCorners(center, 10, 10).map(corner => pointRelative(corner, cc.position(), cosa, sina));
                if (obstructs.every(obstruct => rectsDisjoint(obstruct, corners))) {
                    barracks.push({
                        position: pointRelative(center, cc.position(), cosa, sina),
                        corners: corners
                    });
                    xx += dx*20;
                    zz += dz*20;
                    continue;
                }
            }
            const center = [xx + dx*8 + dz*8, zz - dx*8 + dz*8];
            const corners = rectCorners(center, 8, 8).map(corner => pointRelative(corner, cc.position(), cosa, sina));
            if (obstructs.every(obstruct => rectsDisjoint(obstruct, corners))) {
                houses.push({
                    position: pointRelative(center, cc.position(), cosa, sina),
                    corners: corners
                });
                xx += dx*16;
                zz += dz*16;
                continue;
            }
            xx += dx * 16;
            zz += dz * 16;
        }
    });
    return {
        houses: houses,
        barracks: barracks
    };
}

STEVENLAU.StevenlauBot.prototype.firstEntities = function() {
    const entities = {
        women: [],
        crossbowmen: [],
        spearmen: [],
        swordcav: null,
        minister: null,
        cc: null,
        enemyCC: null,
        trees: [],
        baseTrees: [],
        fruits: [],
        chickens: [],
        metals: [],
        stones: [],
        meats: []
    };
    this.gameState.getOwnEntities().forEach(ent => {
        const s = ent.genericName();
        if (s == "Female Citizen") entities.women.push(ent);
        else if (s == "Infantry Crossbowman") entities.crossbowmen.push(ent);
        else if (s == "Spearman") entities.spearmen.push(ent);
        else if (s == "Cavalry Swordsman") entities.swordcav = ent;
        else if (s == "Imperial Minister") entities.minister = ent;
        else if (s == "Civic Center") entities.cc = cacheStructureCorners(ent);
        else this.chat(`unhandled first entity: ${s}`);
    });
    this.gameState.getEntities().forEach(ent => {
        const s = ent.genericName();
        if (s == "Civic Center" && this.gameState.isEntityEnemy(ent)) {
            entities.enemyCC = ent;
            return;
        }
        if (!ent.resourceSupplyType()) return;
        if (s == "Tree") entities.trees.push(ent);
        else if (s == "Fruit") entities.fruits.push(ent);
        else if (s == "Chicken") entities.chickens.push(ent);
        else if (s == "Metal Mine") entities.metals.push(ent);
        else if (s == "Stone Quarry") entities.stones.push(ent);
        else if (ent.resourceSupplyType().specific == "meat") entities.meats.push(ent);
        else this.chat(`unhandled first entity: ${s}`);
    });
    const cacheCCDist = ent => {
        ent.ccDist = pointRectDistanceSquared(ent.position(), entities.cc.corners);
        return ent;
    };
    const byCCDist = (a, b) => a.ccDist - b.ccDist;

    // Too many trees, don't sort
    entities.trees = entities.trees.map(cacheCCDist);

    entities.fruits = entities.fruits.map(cacheCCDist).sort(byCCDist).slice(0, 5).map(cacheStructureCorners);
    entities.chickens = entities.chickens.map(cacheCCDist).sort(byCCDist).slice(0, 10);

    // Not many entities, use sort to find min is fast enough
    entities.cavChicken = entities.chickens
                                  .map(chicken => {
                                      chicken.cavDist = API3.SquareVectorDistance(chicken.position(), entities.swordcav.position());
                                      return chicken;
                                  })
                                  .sort((a, b) => a.cavDist - b.cavDist)[0];
    entities.metal = cacheStructureCorners(entities.metals.map(cacheCCDist).sort(byCCDist)[0]);
    entities.stone = cacheStructureCorners(entities.stones.map(cacheCCDist).sort(byCCDist)[0]);

    // Heuristics: fixed 12 fields layout, filter possibles
    const mines = [entities.metal.corners, entities.stone.corners];
    const fields = fieldsAround(entities.cc, entities.cc.cosa, entities.cc.sina, mines).map(field => {
        field.enemyCCDist = API3.SquareVectorDistance(field.position, entities.enemyCC.position());
        return field;
    }).sort((a, b) => b.enemyCCDist - a.enemyCCDist);

    // Heuristics: greedy 3 barracks and houses surround 12 fields
    const fieldTrees = [];
    const houseTrees = [];
    entities.trees.forEach(tree => {
        if (tree.ccDist > 7000) return;
        cacheStructureCorners(tree);
        if (tree.ccDist > 3000) {
            houseTrees.push(tree);
        } else if (fields.every(field => rectsDisjoint(field.corners, tree.corners))) {
            houseTrees.push(tree);
        } else {
            fieldTrees.push(tree);
        }
    });
    const housesBarracks = housesBarracksAround(entities.cc, entities.cc.cosa, entities.cc.sina, [...mines, ...houseTrees.map(tree => tree.corners)]);
    entities.houses = housesBarracks.houses;
    entities.barracks = housesBarracks.barracks;

    // Heuristics: among the houses, pick best to be farmstead
    entities.farmstead = entities.houses.filter(house => {
        return [...entities.fruits, ...fieldTrees].every(s => rectsDisjoint(s.corners, house.corners));
    }).map(house => {
        house.fruitDist = Math.min(...entities.fruits.map(fruit => {
            return API3.SquareVectorDistance(fruit.position(), house.position);
        }));
        return house;
    }).sort((a, b) => a.fruitDist - b.fruitDist)[0];
    entities.houses.splice(entities.houses.findIndex(x => x == entities.farmstead), 1);

    if (fieldTrees.length > 0) {
        // Must clear all field trees to build fields
        entities.baseTrees = fieldTrees.sort(byCCDist);
    } else {
        // Trees are far away, but we still need one tree for init wood
        entities.baseTrees = [houseTrees.reduce((nearest, tree) => {
            if (!nearest || tree.ccDist < nearest.ccDist) return tree;
            return nearest;
        }, null)];
        this.chat(`far tree: ${Math.sqrt(entities.baseTrees[0].ccDist)}`);
    }

    this.chat(`cc: ${positionToString(entities.cc.position())} ${roundDD(entities.cc.angle())}rad, ${fields.length} fields ${entities.baseTrees.length} base trees`);
    return entities;
};

STEVENLAU.StevenlauBot.prototype.OnUpdate = function()
{
    if (this.state == 0) {
        if (this.gameState.getTimeElapsed() < 1000) return;
        if (this.gameState.getPlayerCiv() != "han") {
            this.chat("stevenlauBot only works for Han.");
            this.state = -1;
            return;
        }
        this.entities = this.firstEntities();

        // Train 6 women
        this.entities.cc.train(this.gameState.getPlayerCiv(), "units/han/support_female_citizen", 6);

        // Worst wood cutter to build farmstead
        const firstTree = this.entities.baseTrees[0];
        const {women, crossbowmen, spearmen, swordcav, minister} = this.entities;
        const units = [...women, ...crossbowmen, ...spearmen, minister].map(unit => {
            const teleportDist = pointRectDistanceSquared(unit.position(), this.entities.cc.corners) +
                                 firstTree.ccDist;
            const walkDist = API3.SquareVectorDistance(firstTree.position(), unit.position());
            unit.firstTreeDist = {
                teleport: teleportDist,
                walk: walkDist,
                min: Math.min(teleportDist, walkDist)
            };
            return unit;
        });
        const workers = units.slice(0, 8).sort((a, b) => b.firstTreeDist.min - a.firstTreeDist.min);
        const builders = workers.slice(0, 2).map(worker => {
            const teleportDist = pointRectDistanceSquared(worker.position(), this.entities.cc.corners) +
                                 pointRectDistanceSquared(this.entities.farmstead.position, this.entities.cc.corners);
            const walkDist = API3.SquareVectorDistance(worker.position(), this.entities.farmstead.position);
            worker.farmsteadDist = {
                teleport: teleportDist,
                walk: walkDist,
                min: Math.min(teleportDist, walkDist)
            };
            return worker;
        }).sort((a, b) => a.farmsteadDist.min  - b.farmsteadDist.min);

        // builders[0] construct farmstead
        this.constructing = new Map([["Farmstead", builders[0]], ["House", builders[1]]]);
        this.teleporting = new Map();
        builders[0].construct("structures/han/farmstead",
                              this.entities.farmstead.position[0],
                              this.entities.farmstead.position[1],
                              this.entities.cc.angle());
        if (builders[0].farmsteadDist.teleport < builders[0].farmsteadDist.walk) {
            builders[0].garrison(this.entities.cc);
            this.teleporting.set(builders[0].id(), []);
            // Fill later when foundation is made
        }

        // builders[1] construct house
        const house = this.entities.houses.filter(house => {
            const obstructs = [...this.entities.fruits, ...this.entities.baseTrees];
            return obstructs.every(obstruct => rectsDisjoint(obstruct.corners, house.corners));
        }).map(house => {
            const teleportDist = pointRectDistanceSquared(builders[1].position(), this.entities.cc.corners) +
                                 pointRectDistanceSquared(house.position, this.entities.cc.corners);
            const walkDist = API3.SquareVectorDistance(builders[1].position(), house.position);
            house.builderDist = {
                teleport: teleportDist,
                walk: walkDist,
                min: Math.min(teleportDist, walkDist)
            };
            return house;
        }).sort((a, b) => a.builderDist.min - b.builderDist.min)[0];
        this.entities.houses.splice(this.entities.houses.findIndex(x => x == house), 1);
        builders[1].construct("structures/han/house",
                              house.position[0],
                              house.position[1],
                              this.entities.cc.angle());
        if (house.builderDist.teleport < house.builderDist.walk) {
            builders[1].garrison(this.entities.cc);
            this.teleporting.set(builders[1].id(), []);
            // Fill later when foundation is made
        }

        // Other workers cut wood
        for (const unit of [...workers.slice(2), minister]) {
            if (unit.firstTreeDist.walk < unit.firstTreeDist.teleport) {
                unit.gather(firstTree);
            } else {
                unit.garrison(this.entities.cc);
                this.teleporting.set(unit.id(), [unit, firstTree, "gather"]);
            }
        }

        // Swordcav hunt chicken
        const teleportDist = pointRectDistanceSquared(swordcav.position(), this.entities.cc.corners) +
                             this.entities.chickens[0].ccDist;
        if (API3.SquareVectorDistance(this.entities.cavChicken.position(), swordcav.position()) < teleportDist) {
            // Walk to chicken nearest to swordcav
            swordcav.gather(this.entities.cavChicken);
        } else {
            // Teleport to chicken nearest to CC
            swordcav.garrison(this.entities.cc);
            this.teleporting.set(swordcav.id(), [swordcav, this.entities.chickens[0]]);
        }
        this.state = 1;
    } else if (this.state == 1) {
        // Handle teleports
        for (const id of this.entities.cc.garrisoned()) {
            if (!this.teleporting.has(id)) {
                this.chat(`unknown garrison: ${id}`);
                continue;
            }
            const [unit, target, command] = this.teleporting.get(id);
            this.entities.cc.setRallyPoint(target, command);
            this.entities.cc.unload(id);
            this.teleporting.delete(id);
        }

        // Construct buildings
        if (this.constructing.size > 0) {
            this.gameState.getOwnFoundations().forEach(foundation => {
                if (!this.constructing.has(foundation.genericName())) {
                    this.chat(`unhandled foundation: ${foundation.genericName()}`);
                    return;
                }
                const unit = this.constructing.get(foundation.genericName());
                if (this.teleporting.has(unit.id())) {
                    this.teleporting.set(unit.id(), [unit, foundation, "repair"]);
                } else {
                    unit.repair(foundation);
                }
                this.constructing.delete(foundation.genericName());
            });
            this.constructing.forEach(foundation => {
                this.chat(`error constructing ${foundation}`);
            });
        }

        if (this.teleporting.size == 0) {
            // Done teleporting
            this.entities.cc.setRallyPoint(this.entities.fruits[0], "gather");
            this.state = 2;
        }
    } else if (this.state == 2) {
        // Idle cavs go hunt
        const idleCavs = [];
        this.gameState.getOwnUnits().forEach(unit => {
            if (!unit.isIdle()) return;
            if (unit.genericName() != "Cavalry Swordsman") return;
            idleCavs.push(unit);
        });
        if (idleCavs.length > 0) {
            let meat = null;
            this.gameState.getResourceSupplies("food").forEach(supply => {
                if (supply.resourceSupplyType().specific != "meat") return;
                // Far away, so rouch distance from CC center is enough
                supply.dist = API3.SquareVectorDistance(supply.position(), this.entities.cc.position());
                if (!meat || supply.dist < meat.dist) meat = supply;
            });
            if (meat) idleCavs.forEach(cav => cav.gather(meat));
        }
    }
};

