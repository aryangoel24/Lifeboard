"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  User,
  Book,
  Zap,
  FolderOpen,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeNode, NodeType, MasteryStatus } from "@/types/database";
import type { LucideIcon } from "lucide-react";

export interface KnowledgeNodeData {
  node: KnowledgeNode;
  rootColor: string;
  onExpand: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  selected: boolean;
  hasUserContent: boolean;
  nodeType: NodeType;
  masteryStatus: MasteryStatus;
  childCount: number;
  isCollapsed: boolean;
  linkCount: number;
  onToggleCollapse: (nodeId: string) => void;
  isSynthesisSelected?: boolean;
  onRename?: (nodeId: string, newTitle: string) => Promise<void>;
}

const NODE_TYPE_ICONS: Partial<Record<NodeType, LucideIcon>> = {
  concept: Lightbulb,
  person: User,
  book: Book,
  skill: Zap,
  project: FolderOpen,
  question: HelpCircle,
  insight: Sparkles,
};

const MASTERY_COLORS: Record<Exclude<MasteryStatus, 'not_started'>, string> = {
  learning: '#3b82f6',
  practicing: '#f97316',
  mastered: '#22c55e',
};

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
  const {
    node,
    rootColor,
    onExpand,
    onDelete,
    selected,
    hasUserContent,
    nodeType,
    masteryStatus,
    childCount,
    isCollapsed,
    linkCount,
    onToggleCollapse,
    isSynthesisSelected,
    onRename,
  } = data;
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const isRoot = node.depth === 0;

  useEffect(() => {
    setEditTitle(node.title);
  }, [node.title]);

  function startEditing(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(node.title);
  }

  async function confirmRename() {
    const trimmed = editTitle.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === node.title) return;
    await onRename?.(node.id, trimmed);
  }

  function cancelEdit() {
    setEditTitle(node.title);
    setIsEditing(false);
  }

  const rgb = hexToRgb(rootColor);
  const bgTint = rgb
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`
    : "transparent";

  const TypeIcon = nodeType !== 'topic' ? NODE_TYPE_ICONS[nodeType] : null;
  const masteryColor = masteryStatus !== 'not_started' ? MASTERY_COLORS[masteryStatus] : null;

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 cursor-pointer group transition-all duration-200 select-none",
        isRoot ? "w-52 min-h-[80px]" : "w-40 min-h-[60px]",
        selected ? "shadow-lg ring-2 ring-offset-1" : "shadow-sm hover:shadow-md",
        isSynthesisSelected && "ring-2 ring-blue-500 ring-offset-1"
      )}
      style={{
        borderColor: isSynthesisSelected ? "#3b82f6" : rootColor,
        backgroundColor: bgTint,
        boxShadow: selected ? `0 0 0 2px ${rootColor}` : undefined,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onDoubleClick={onRename ? startEditing : undefined}
    >
      {/* Synthesis check badge */}
      {isSynthesisSelected && (
        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center z-10">
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white fill-none stroke-current stroke-2">
            <polyline points="2,6 5,9 10,3" />
          </svg>
        </span>
      )}
      {/* Left color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md"
        style={{ backgroundColor: rootColor }}
      />

      {/* Cross-link badge (top-left, above color bar) */}
      {linkCount > 0 && (
        <span className="absolute top-1 left-3 text-[9px] text-muted-foreground bg-muted/80 rounded px-1 py-0 leading-4 font-mono">
          ↔ {linkCount}
        </span>
      )}

      {/* User content dot (top-right) */}
      {hasUserContent && (
        <span
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: rootColor }}
        />
      )}

      {/* Node type icon (top-right, below user content dot if present) */}
      {TypeIcon && (
        <span
          className="absolute right-1.5 opacity-60"
          style={{ color: rootColor, top: hasUserContent ? '14px' : '6px' }}
        >
          <TypeIcon className="h-3 w-3" />
        </span>
      )}

      <div className={cn("px-3 py-2 pl-3.5", linkCount > 0 ? "pt-4" : "")}>
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.stopPropagation(); confirmRename(); }
              if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
              if (e.key === "Delete" || e.key === "Backspace") { e.stopPropagation(); }
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className={cn(
              "h-auto border-0 shadow-none bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 leading-tight break-words",
              isRoot ? "font-bold text-sm" : "font-medium text-xs"
            )}
          />
        ) : (
          <p
            className={cn(
              "leading-tight break-words",
              isRoot ? "font-bold text-sm" : "font-medium text-xs"
            )}
          >
            {node.title}
          </p>
        )}
      </div>

      {/* Mastery dot (bottom-left) */}
      {masteryColor && (
        <span
          className="absolute bottom-2 left-3 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: masteryColor }}
        />
      )}

      {/* Action buttons */}
      <div
        className={cn(
          "absolute bottom-1 right-1 flex gap-1 transition-opacity",
          showActions || selected ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Collapse/expand button (only if has children) */}
        {childCount > 0 && (
          <button
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center gap-0.5"
            title={isCollapsed ? "Expand subtree" : "Collapse subtree"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
          >
            {isCollapsed ? (
              <>
                <ChevronRight className="h-3 w-3" style={{ color: rootColor }} />
                <span className="text-[9px]" style={{ color: rootColor }}>{childCount}</span>
              </>
            ) : (
              <ChevronDown className="h-3 w-3" style={{ color: rootColor }} />
            )}
          </button>
        )}
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
