import { git } from "./git.js";

export function headHasTrailer(
  repoRoot: string,
  headRef: string,
  hash: string,
): boolean {
  const headMsg = git(["log", "-1", "--format=%B", headRef], repoRoot, {
    allowFail: true,
  });
  return new RegExp(`^Know-Code-Verified:\\s*${hash}\\s*$`, "im").test(headMsg);
}
