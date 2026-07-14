import {describe,expect,it} from "vitest";
import {safeRedirectPath} from "./redirect";

describe("safeRedirectPath",()=>{
  it("preserves an internal cup deep link",()=>expect(safeRedirectPath("/tournaments/cup-1?invite=1")).toBe("/tournaments/cup-1?invite=1"));
  it.each(["https://evil.test","//evil.test","/\\evil.test","javascript:alert(1)",null])("rejects unsafe destination %s",(value)=>expect(safeRedirectPath(value)).toBe("/"));
});
