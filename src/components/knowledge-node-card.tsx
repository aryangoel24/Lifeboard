"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeNode } from "@/types/database";

export interface KnowledgeNodeData {
  node: KnowledgeNode;
  rootColor: string;
  onExpand: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  selected: boolean;
  hasUserContent: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export const KnowledgeNodeCard = memo(function KnowledgeNodeCard({
  data,
}: NodeProps & { data: KnowledgeNodeData }) {
  const { node, rootColor, onExpand, onDelete, onSelect, selected, hasUserContent } = data;
  const [showDelete, setShowDelete] = useState(false);
  const isRoot = node.depth === 0;

  const rgb = hexToRgb(rootColor);
  const bgTint = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`
    : "transparent";

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 cursor-pointer group transition-all duration-200 select-none",
        isRoot ? "w-52 min-h-[80px]" : "w-40 min-h-[60px]",
        selected ? "shadow-lg ring-2 ring-offset-1" : "shadow-sm hover:shadow-md"
      )}
      style={{
        borderColor: rootColor,
        backgroundColor: bgTint,
        boxShadow: selected ? `0 0 0 2px ${rootColor}` : undefined,
      }}
      onClick={() => onSelect(node.id)}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Left color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
        style={{ backgroundColor: rootColor }}
      />

      {hasUserContent && (
        <span
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: rootColor }}
        />
      )}

      <div className="px-3 py-2 pl-3.5">
        <p
          className={cn(
            "leading-tight break-words",
            isRoot ? "font-bold text-sm" : "font-medium text-xs"
          )}
        >
          {node.title}
        </p>
      </div>

      {/* Action buttons */}
      <div
        className={cn(
          "absolute bottom-1 right-1 flex gap-1 transition-opacity",
          showDelete || selected ? "opacity-100" : "opacity-0"
        )}
      >
        <button
          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Expand subtopics"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(node.id);
          }}
        >
          <Plus className="h-3 w-3" style={{ color: rootColor }} />
        </button>
        <button
          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          title="Delete node"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
        >
          <Trash2 className="h-3 w-3 text-red-500" />
        </button>
      </div>

      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
});
