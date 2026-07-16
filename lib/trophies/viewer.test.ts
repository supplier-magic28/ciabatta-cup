import {describe,expect,it} from "vitest";
import {arFailureHint,shouldAutoRotateTrophy,trophyViewerControls} from "./viewer";

describe("trophy viewer controls",()=>{
  it("shows Android AR only after a supported model has loaded",()=>{expect(trophyViewerControls({loaded:false,failed:false,canActivateAr:true,androidAr:true}).showArButton).toBe(false);expect(trophyViewerControls({loaded:true,failed:false,canActivateAr:true,androidAr:true})).toEqual({showArButton:true,showArUnavailable:false});expect(trophyViewerControls({loaded:true,failed:false,canActivateAr:false,androidAr:true})).toEqual({showArButton:false,showArUnavailable:true});});
  it("keeps iOS and failed models out of the Android AR launch",()=>{expect(trophyViewerControls({loaded:true,failed:false,canActivateAr:true,androidAr:false}).showArButton).toBe(false);expect(trophyViewerControls({loaded:true,failed:true,canActivateAr:true,androidAr:true})).toEqual({showArButton:false,showArUnavailable:false});});
  it("reports failed AR without changing the viewer and honors reduced motion",()=>{expect(arFailureHint("failed")).toContain("AR could not start");expect(arFailureHint("object-placed")).toBeNull();expect(shouldAutoRotateTrophy(false)).toBe(true);expect(shouldAutoRotateTrophy(true)).toBe(false);});
});
