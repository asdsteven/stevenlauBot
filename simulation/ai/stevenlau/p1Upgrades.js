import { SquareVectorDistance } from "simulation/ai/common-api/utils.js";
import * as filters from "simulation/ai/common-api/filters.js";

// Assume no barracks.  Resign on big inf rush.

STEVENLAU.StevenlauBot.prototype.idleCavHunt = function() {
    // Idle cavs go hunt
    const idleCavs = this.gameState.getOwnEntitiesByClass("Cavalry").filter(filters.isIdle());
    if (idleCavs._entities.size > 0) {
        const isMeat = x => x.resourceSupplyType().specific == "meat";
        const ccDist = x => x.ccDist = SquareVectorDistance(x.position(), this.entities.cc.position());
        const supplies = this.gameState.getResourceSupplies("food").values().filter(isMeat).map(ccDist);
        if (supplies.length > 0) {
            const meat = minArg(x => x.ccDist, supplies);
            idleCavs.forEach(cav => cav.gather(meat));
        }
    }
};

STEVENLAU.StevenlauBot.prototype.p1Upgrades = function()
{
    Engine.PostCommand(this.gameState.getPlayerID(), {"type": "resign"});
    this.resigned = true;
    return 0;
};

