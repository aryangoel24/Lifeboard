import type { NodeType } from "@/types/database";

export type ScaffoldTemplate = {
  id: string;
  label: string;
  description: string;
  roots: {
    title: string;
    node_type: NodeType;
    children: { title: string; node_type: NodeType }[];
  }[];
};

export const SCAFFOLD_TEMPLATES: ScaffoldTemplate[] = [
  {
    id: "life",
    label: "Life Areas",
    description: "Map the core domains of your life — personal growth, health, relationships, and more.",
    roots: [
      {
        title: "Personal Growth",
        node_type: "topic",
        children: [
          { title: "Mindset & Beliefs", node_type: "concept" },
          { title: "Habits & Routines", node_type: "skill" },
          { title: "Self-Reflection Practice", node_type: "skill" },
        ],
      },
      {
        title: "Work & Career",
        node_type: "topic",
        children: [
          { title: "Current Role", node_type: "project" },
          { title: "Career Goals", node_type: "topic" },
          { title: "Professional Skills", node_type: "skill" },
        ],
      },
      {
        title: "Health & Fitness",
        node_type: "topic",
        children: [
          { title: "Physical Training", node_type: "skill" },
          { title: "Nutrition", node_type: "topic" },
          { title: "Sleep & Recovery", node_type: "topic" },
        ],
      },
      {
        title: "Relationships",
        node_type: "topic",
        children: [
          { title: "Family", node_type: "topic" },
          { title: "Friends", node_type: "topic" },
          { title: "Community", node_type: "topic" },
        ],
      },
      {
        title: "Hobbies & Interests",
        node_type: "topic",
        children: [
          { title: "Creative Pursuits", node_type: "topic" },
          { title: "Sports & Activities", node_type: "topic" },
        ],
      },
      {
        title: "Finance",
        node_type: "topic",
        children: [
          { title: "Budgeting", node_type: "skill" },
          { title: "Investing", node_type: "skill" },
          { title: "Financial Goals", node_type: "topic" },
        ],
      },
    ],
  },
  {
    id: "professional",
    label: "Professional",
    description: "Organize your career history, skills, projects, and professional network.",
    roots: [
      {
        title: "Career History",
        node_type: "topic",
        children: [
          { title: "Past Roles", node_type: "topic" },
          { title: "Key Achievements", node_type: "insight" },
          { title: "Lessons Learned", node_type: "insight" },
        ],
      },
      {
        title: "Skills & Expertise",
        node_type: "topic",
        children: [
          { title: "Technical Skills", node_type: "skill" },
          { title: "Soft Skills", node_type: "skill" },
          { title: "Domain Knowledge", node_type: "topic" },
        ],
      },
      {
        title: "Active Projects",
        node_type: "topic",
        children: [
          { title: "Current Work", node_type: "project" },
          { title: "Side Projects", node_type: "project" },
        ],
      },
      {
        title: "Learning & Development",
        node_type: "topic",
        children: [
          { title: "Courses & Training", node_type: "topic" },
          { title: "Books & Resources", node_type: "book" },
          { title: "Learning Goals", node_type: "topic" },
        ],
      },
      {
        title: "Professional Network",
        node_type: "topic",
        children: [
          { title: "Mentors", node_type: "person" },
          { title: "Collaborators", node_type: "person" },
          { title: "Industry Contacts", node_type: "person" },
        ],
      },
    ],
  },
  {
    id: "learning",
    label: "Learning & Skills",
    description: "Track books, technical skills, mental models, and ideas you're exploring.",
    roots: [
      {
        title: "Books & Reading",
        node_type: "topic",
        children: [
          { title: "Currently Reading", node_type: "book" },
          { title: "Want to Read", node_type: "book" },
          { title: "Key Takeaways", node_type: "insight" },
        ],
      },
      {
        title: "Technical Skills",
        node_type: "topic",
        children: [
          { title: "Programming Languages", node_type: "skill" },
          { title: "Tools & Frameworks", node_type: "skill" },
          { title: "Systems & Architecture", node_type: "concept" },
        ],
      },
      {
        title: "Mental Models",
        node_type: "topic",
        children: [
          { title: "Decision Frameworks", node_type: "concept" },
          { title: "Thinking Biases", node_type: "concept" },
          { title: "Problem-Solving Patterns", node_type: "concept" },
        ],
      },
      {
        title: "Courses & Certifications",
        node_type: "topic",
        children: [
          { title: "Active Courses", node_type: "topic" },
          { title: "Completed Certifications", node_type: "topic" },
        ],
      },
      {
        title: "Ideas & Questions",
        node_type: "topic",
        children: [
          { title: "Open Questions", node_type: "question" },
          { title: "Hypotheses", node_type: "insight" },
          { title: "Research Areas", node_type: "topic" },
        ],
      },
    ],
  },
];
