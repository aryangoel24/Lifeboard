import { getRecentDigests } from "@/lib/actions/digest";
import { DigestClient } from "@/components/digest-client";

export default async function DigestPage() {
  const recentDigests = await getRecentDigests();
  return <DigestClient recentDigests={recentDigests} />;
}
