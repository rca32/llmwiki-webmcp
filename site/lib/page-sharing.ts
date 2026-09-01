const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PagePermalinkTarget = {
  wikiId: string;
  pageId: string;
};

export function buildWikiPermalink(currentUrl: string, wikiId: string) {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("wiki", wikiId);
  return url.toString();
}

export function buildPagePermalink(
  currentUrl: string,
  wikiId: string,
  pageId: string,
) {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("wiki", wikiId);
  url.searchParams.set("page", pageId);
  return url.toString();
}

export function readPagePermalink(
  currentUrl: string,
): PagePermalinkTarget | null {
  const url = new URL(currentUrl),
    wikiId = url.searchParams.get("wiki") ?? "",
    pageId = url.searchParams.get("page") ?? "";
  if (!UUID_PATTERN.test(wikiId) || !UUID_PATTERN.test(pageId)) return null;
  return { wikiId, pageId };
}

export function buildCodexResearchPrompt(title: string, permalink: string) {
  return [
    "다음 Liminal Wiki 페이지를 출발점으로 추가 조사해줘.",
    "",
    `페이지: ${title}`,
    `링크: ${permalink}`,
    "",
    "기존 주장과 출처를 먼저 확인하고, 새 근거는 원문 URL·발행일·검색일·추출 방법·신뢰도와 함께 정리해줘. 기존 내용과 충돌하는 정보는 덮어쓰지 말고 차이를 명시한 뒤 위키 반영 계획을 먼저 보여줘.",
  ].join("\n");
}
