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

STEVENLAU.StevenlauBot.prototype.countGenericNames = function() {
    const genericNames = new Map();
    this.gameState.getEntities().forEach(ent => {
        const name = ent.genericName();
        genericNames.set(name, (genericNames.get(name) || 0) + 1);
    });
    for (const [name, count] of genericNames) {
        this.chat(`${name}: ${count}`);
    }
}

function pointSegmentDistanceSquared(target, p1, p2) {
    const u = new Vector2D(target[0] - p1[0], target[1] - p1[1]);
    const v = new Vector2D(p2[0] - p1[0], p2[1] - p1[1]);
    const t = u.dot(v) / v.dot(v);
    if (t <= 0) {
        return API3.SquareVectorDistance(target, p1);
    }
    if (1 <= t) {
        return API3.SquareVectorDistance(target, p2);
    }
    return v.mult(t).add(new Vector2D(p1[0], p1[1])).distanceToSquared(new Vector2D(target[0], target[1]));
}

function structureCorners([x, z], angle, w, h) {
    const cosa = Math.cos(angle);
    const sina = Math.sin(angle);
    const dxz = [[h,w],[-h,w],[-h,-w],[h,-w],[h,w]];
    return [0,1,2,3].map(i => {
        const [dx1, dz1] = dxz[i];
        const [dx2, dz2] = dxz[i + 1];
        const p1 = [
            x + cosa * 0.5 * dx1 - sina * 0.5 * dz1,
            z + sina * 0.5 * dx1 + cosa * 0.5 * dz1
        ];
        const p2 = [
            x + cosa * 0.5 * dx2 - sina * 0.5 * dz2,
            z + sina * 0.5 * dx2 + cosa * 0.5 * dz2
        ];
        return [p1, p2];
    });
}

STEVENLAU.StevenlauBot.prototype.firstWoodFruitChicken = function() {
    let cc;
    this.gameState.getOwnDropsites().forEach(site => cc = site);
    this.chat(`cc: ${cc.position()} ${cc.angle()}`);
    const ccCorners = structureCorners(cc.position(), cc.angle(), +cc.get("Obstruction/Static/@width"), +cc.get("Obstruction/Static/@depth"));

    let cav;
    this.gameState.getOwnUnits().forEach(unit => {
        if (unit.genericName() == "Cavalry Swordsman") {
            cav = unit;
        }
    });

    const list = [];
    this.gameState.getResourceSupplies("wood").forEach(supply => {
        list.push([supply, API3.SquareVectorDistance(supply.position(), cc.position())]);
    });
    list.sort((a, b) => a[1] - b[1]);
    list.slice(0, 10).forEach(a => this.chat(`tree: ${a[0].position()}: ${a[1]}`));

    const nearestSupply = new Map();
    const f = supply => {
        const res = supply.resourceSupplyType().specific;
        let dist;
        if (res == "meat") {
            dist = API3.SquareVectorDistance(supply.position(), cav.position())
        } else {
            dist = Math.min(...ccCorners.map(([p1,p2]) => {
                return pointSegmentDistanceSquared(supply.position(), p1, p2);
            }));
        }
        if (!nearestSupply.has(res)) {
            nearestSupply.set(res, [supply, dist]);
        } else if (dist < nearestSupply.get(res)[1]) {
            nearestSupply.set(res, [supply, dist]);
            /* this.chat(`${supply.position()}: ${dist}`); */
        }
    };
    this.gameState.getResourceSupplies("wood").forEach(f);
    this.gameState.getResourceSupplies("food").forEach(f);
    this.chat(`nearest: ${nearestSupply.get("tree")[0].position()}, ${nearestSupply.get("tree")[1]}`);
    return ["tree","fruit","meat"].map(res => nearestSupply.get(res)[0]);
}

STEVENLAU.StevenlauBot.prototype.nearest = function(wood, tree) {
    let cc;
    this.gameState.getOwnDropsites().forEach(site => cc = site);
    const ccCorners = structureCorners(cc.position(), cc.angle(), +cc.get("Obstruction/Static/@width"), +cc.get("Obstruction/Static/@depth"));

    const nearestSupply = new Map();
    const f = supply => {
        const res = supply.resourceSupplyType().specific;
        const dist = Math.min(...ccCorners.map(([p1,p2]) => {
            return pointSegmentDistanceSquared(supply.position(), p1, p2);
        }));
        if (!nearestSupply.has(res)) {
            nearestSupply.set(res, [supply, dist]);
        } else if (dist < nearestSupply.get(res)[1]) {
            nearestSupply.set(res, [supply, dist]);
        }
    };
    this.gameState.getResourceSupplies(wood).forEach(f);
    return nearestSupply.get(tree)[0];
}

STEVENLAU.StevenlauBot.prototype.OnUpdate = function(gameState)
{
    if (this.state == 0) {
        if (this.gameState.getPlayerCiv() != "han") {
            this.chat("stevenlauBot only works for Han.");
            this.state = -1;
            return;
        }

        const [wood,fruit,chicken] = this.firstWoodFruitChicken();
        this.gameState.getOwnUnits().forEach(unit => {
            if (!unit.isIdle()) {
                return;
            }
            if (unit.genericName() == "Infantry Crossbowman") {
                unit.gather(wood);
            } else if (unit.genericName() == "Spearman") {
                unit.gather(wood);
            } else if (unit.genericName() == "Female Citizen") {
                unit.gather(wood);
            } else if (unit.genericName() == "Cavalry Swordsman") {
                unit.gather(chicken);
            } else if (unit.genericName() == "Imperial Minister") {
            } else {
                this.chat(`unhandled unit: ${unit.genericName()}`);
            }
        });

        this.state = 1;
    } else if (this.state == 1) {
        this.gameState.getOwnUnits().forEach(unit => {
            if (!unit.isIdle()) {
                return;
            }
            if (unit.genericName() == "Infantry Crossbowman") {
                unit.gather(this.nearest("wood", "tree"));
            } else if (unit.genericName() == "Spearman") {
                unit.gather(this.nearest("wood", "tree"));
            } else if (unit.genericName() == "Female Citizen") {
                unit.gather(this.nearest("wood", "tree"));
            } else if (unit.genericName() == "Cavalry Swordsman") {
                unit.gather(this.nearest("food", "meat"));
            } else if (unit.genericName() == "Imperial Minister") {
            } else {
                this.chat(`unhandled unit: ${unit.genericName()}`);
            }
        });
    }
};

