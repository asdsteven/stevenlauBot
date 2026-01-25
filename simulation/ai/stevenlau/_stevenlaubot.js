Engine.IncludeModule("common-api");

var STEVENLAU = {};

STEVENLAU.StevenlauBot = function(settings)
{
    API3.BaseAI.call(this, settings);
};

STEVENLAU.StevenlauBot.prototype = Object.create(API3.BaseAI.prototype);

function minArg(f, xs) {
    return xs.reduce((m, x) => f(x) < f(m) ? x : m, xs[0]);
}

function by(f) {
    return (a, b) => f(a) - f(b);
}

function sum(xs) {
    return xs.reduce((s, x) => s + x);
}

function arrayRemove(y, xs) {
    xs.splice(xs.findIndex(x => x == y), 1);
}

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

function convexHull(points) {
    points.sort((a, b) => a[0] == b[0] ? a[1] - b[1] : a[0] - b[0]);
    const lower = [];
    for (const p of points) {
        const v = new Vector2D(...p);
        while (lower.length >= 2 && Vector2D.sub(lower.at(-1), lower.at(-2)).cross(Vector2D.sub(v, lower.at(-2))) <= 0) {
            lower.pop();
        }
        lower.push(v);
    }
    const upper = [];
    for (let i = points.length-1; i >= 0; i--) {
        const v = new Vector2D(...points[i]);
        while (upper.length >= 2 && Vector2D.sub(upper.at(-1), upper.at(-2)).cross(Vector2D.sub(v, upper.at(-2))) <= 0) {
            upper.pop();
        }
        upper.push(v);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function clusterForests(trees) {
    const bucket = new Map();
    for (const tree of trees) {
        const [x, z] = tree.position();
        const key = Math.round(x / 20) * 1000 + Math.round(z / 20);
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key).push(tree);
        tree.boss = bucket.get(key)[0];
    }
    const bigBoss = tree => {
        if (tree.boss == tree) return tree;
        return tree.boss = bigBoss(tree.boss);
    };
    for (const [key, trees] of bucket) {
        const [x, z] = [Math.floor(key / 1000), key % 1000];
        [-1,0,1].forEach(dx => [-1,0,1].forEach(dz => {
            if (dx == 0 && dz == 0) return;
            const key = (x + dx) * 1000 + z + dz;
            if (!bucket.has(key)) return;
            bigBoss(bucket.get(key)[0]).boss = bigBoss(trees[0]);
        }));
    }
    const forests = new Map();
    trees.forEach(tree => {
        const boss = bigBoss(tree);
        if (!forests.has(boss)) forests.set(boss, []);
        forests.get(boss).push(tree);
    });
    return {
        bucket,
        forests: Array.from(forests.values()).map(forest => {
            const sum = forest.map(tree => tree.position()).reduce(([x,z],[xx,zz]) => [x+xx,z+zz], [0,0]);
            return {
                position: [sum[0]/forest.length, sum[1]/forest.length],
                wood: forest.reduce((sum, tree) => sum + tree.resourceSupplyAmount(), 0),
                trees: forest
            };
        }).filter(forest => forest.trees.length >= 20)
    };
}

STEVENLAU.StevenlauBot.prototype.CustomInit = function(gameState)
{
    this.state = 0;
    this.FSMs = [
        () => {
            if (this.gameState.getPlayerCiv() != "han") {
                throw "stevenlauBot only works for Han.";
            }
            this.chat(`player ${this.gameState.getPlayerID()}`);
            /* if (this.gameState.getTimeElapsed() < 2000) return 1; */
            return 1;
        },
        () => this.veryFirstMoments(),
        () => this.p1Upgrades()
    ];
};

STEVENLAU.StevenlauBot.prototype.OnUpdate = function()
{
    if (this.state == -1) return;
    if (this.resigned) return;
    try {
        while (true) {
            const x = this.FSMs[this.state]();
            if (x == 0) break;
            this.state += Math.floor(x);
            if (x > 1) break;
        }
    } catch (e) {
        this.chat(sanitize(`${e}`));
        this.state = -1;
    }
};
