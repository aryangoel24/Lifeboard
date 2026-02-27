import { getKnowledgeGraph } from "@/lib/actions/knowledge";
import { KnowledgeGraph } from "@/components/knowledge-graph";

export default async function KnowledgeHubPage() {
  const { nodes, links } = await getKnowledgeGraph();

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <KnowledgeGraph initialNodes={nodes} initialLinks={links} />
    </div>
  );
}
