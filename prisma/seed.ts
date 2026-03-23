import "dotenv/config";
import { PrismaClient, IssueStatus, IssuePriority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data
  await prisma.subtask.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.epic.deleteMany();
  await prisma.project.deleteMany();

  // Create a project
  const project = await prisma.project.create({
    data: {
      name: "Solo Kanban",
      description: "The kanban board we are building in this blog series",
    },
  });

  // Create epics
  const setupEpic = await prisma.epic.create({
    data: {
      name: "Project Setup",
      color: "#6366f1", // indigo
      projectId: project.id,
    },
  });

  const boardEpic = await prisma.epic.create({
    data: {
      name: "Board UI",
      color: "#f59e0b", // amber
      projectId: project.id,
    },
  });

  const dndEpic = await prisma.epic.create({
    data: {
      name: "Drag and Drop",
      color: "#10b981", // emerald
      projectId: project.id,
    },
  });

  // Create issues across all statuses
  const issues = [
    {
      number: 1,
      title: "Initialize Next.js project",
      description: "Scaffold the app with create-next-app, install deps, configure Tailwind.",
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: setupEpic.id,
    },
    {
      number: 2,
      title: "Set up Prisma schema",
      description: "Define models for Project, Epic, Issue, and Subtask. Run initial migration.",
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      order: 1,
      epicId: setupEpic.id,
    },
    {
      number: 3,
      title: "Build four-column board layout",
      description: "Use CSS Grid for the column layout. Each column represents a status.\n\n## Requirements\n- Responsive down to tablet\n- Scrollable columns when content overflows\n- Column headers show issue count",
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: boardEpic.id,
    },
    {
      number: 4,
      title: "Design issue card component",
      description: "Cards show title, priority badge, epic label, and subtask progress.",
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.MEDIUM,
      order: 1,
      epicId: boardEpic.id,
    },
    {
      number: 5,
      title: "Implement drag and drop",
      description: "Evaluate dnd-kit vs pragmatic-drag-and-drop. Need cross-column moves and within-column reordering.",
      status: IssueStatus.OPEN,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: dndEpic.id,
    },
    {
      number: 6,
      title: "Add keyboard shortcuts",
      description: "Arrow keys to navigate, Enter to open detail, M to move between columns.",
      status: IssueStatus.OPEN,
      priority: IssuePriority.LOW,
      order: 1,
      epicId: null,
    },
    {
      number: 7,
      title: "Write seed data script",
      description: "Realistic sample data for development and screenshots.",
      status: IssueStatus.REVIEW,
      priority: IssuePriority.MEDIUM,
      order: 0,
      epicId: setupEpic.id,
    },
  ];

  for (const issue of issues) {
    const created = await prisma.issue.create({
      data: {
        ...issue,
        projectId: project.id,
      },
    });

    // Add subtasks to the "Build four-column board layout" issue
    if (issue.title === "Build four-column board layout") {
      await prisma.subtask.createMany({
        data: [
          { title: "Set up CSS Grid container", completed: true, order: 0, issueId: created.id },
          { title: "Create column components", completed: true, order: 1, issueId: created.id },
          { title: "Add overflow scrolling", completed: false, order: 2, issueId: created.id },
          { title: "Test on tablet breakpoint", completed: false, order: 3, issueId: created.id },
        ],
      });
    }
  }

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });