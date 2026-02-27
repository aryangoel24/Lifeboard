import { getKnowledgeGraph } from "@/lib/actions/knowledge";
import { KnowledgeGraph } from "@/components/knowledge-graph";

export default async function KnowledgeHubPage() {
  const nodes = await getKnowledgeGraph();

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <KnowledgeGraph nodes={nodes} />
    </div>
  );
}
