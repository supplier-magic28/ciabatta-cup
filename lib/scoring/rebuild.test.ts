import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient:vi.fn() }));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.createAdminClient}));

import { rebuildRatingCache } from "./rebuild";

function clientWithVersions(versions:number[]) {
  const rpc=vi.fn().mockResolvedValue({error:null});
  const factRows:Record<string,unknown[]>={players:[],matches:[],tournament_placements:[],practice_sessions:[],play_days:[]};
  return {
    rpc,
    from:vi.fn((table:string)=>({
      select:()=>table==="scoring_cache_state"
        ? {eq:()=>({single:async()=>({data:{fact_version:versions.shift()},error:null})})}
        : Promise.resolve({data:factRows[table]??[],error:null}),
    })),
  };
}

describe("rebuildRatingCache",()=>{
  beforeEach(()=>mocks.createAdminClient.mockReset());

  it("retries once when facts change during the read and publishes only the stable version",async()=>{
    const client=clientWithVersions([1,2,2,2]);
    mocks.createAdminClient.mockReturnValue(client);
    await rebuildRatingCache();
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("replace_rating_cache_with_reigns_v2",expect.objectContaining({p_source_version:2}));
  });

  it("does not disguise a fact-load failure as a stale retry",async()=>{
    const client=clientWithVersions([1]);
    client.from=vi.fn((table:string)=>({
      select:()=>table==="scoring_cache_state"
        ? {eq:()=>({single:async()=>({data:{fact_version:1},error:null})})}
        : Promise.resolve({data:null,error:table==="matches"?{message:"offline"}:null}),
    })) as typeof client.from;
    mocks.createAdminClient.mockReturnValue(client);
    await expect(rebuildRatingCache()).rejects.toThrow("Couldn't load match facts");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
