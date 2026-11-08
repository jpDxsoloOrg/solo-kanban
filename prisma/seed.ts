import "dotenv/config";
import { PrismaClient, IssueStatus, IssuePriority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sprint dates are stored as noon UTC on a calendar day (see src/lib/sprint-dates.ts). */
function dayOffset(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) + days * DAY_MS,
  );
}

async function main() {
  // Clean existing data
  await prisma.comment.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.sprint.deleteMany();
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

  // Sprints: one finished, one in progress, one planned
  const sprint1 = await prisma.sprint.create({
    data: {
      projectId: project.id,
      number: 1,
      name: "Sprint 1",
      goal: "Get the project scaffolded and the data model in place.",
      status: "COMPLETED",
      startDate: dayOffset(-21),
      endDate: dayOffset(-7),
      completedAt: new Date(Date.now() - 7 * DAY_MS),
    },
  });

  const sprint2 = await prisma.sprint.create({
    data: {
      projectId: project.id,
      number: 2,
      name: "Sprint 2",
      goal: "Ship a usable board with drag and drop.",
      status: "ACTIVE",
      startDate: dayOffset(-6),
      endDate: dayOffset(8),
    },
  });

  const sprint3 = await prisma.sprint.create({
    data: {
      projectId: project.id,
      number: 3,
      name: "Sprint 3",
      status: "PLANNED",
    },
  });

  // Issues across sprints and statuses. `order` is per (sprint, status) column.
  const issues = [
    // Sprint 1 (completed): its DONE work lives on in the sprint report
    {
      number: 1,
      title: "Initialize Next.js project",
      description: "Scaffold the app with create-next-app, install deps, configure Tailwind.",
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: setupEpic.id,
      sprintId: sprint1.id,
    },
    {
      number: 2,
      title: "Set up Prisma schema",
      description: "Define models for Project, Epic, Issue, and Subtask. Run initial migration.",
      status: IssueStatus.DONE,
      priority: IssuePriority.HIGH,
      order: 1,
      epicId: setupEpic.id,
      sprintId: sprint1.id,
    },
    // Sprint 2 (active): what the board shows
    {
      number: 3,
      title: "Build four-column board layout",
      description: "Use CSS Grid for the column layout. Each column represents a status.\n\n## Requirements\n- Responsive down to tablet\n- Scrollable columns when content overflows\n- Column headers show issue count",
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: boardEpic.id,
      sprintId: sprint2.id,
    },
    {
      number: 4,
      title: "Design issue card component",
      description: "Cards show title, priority badge, epic label, and subtask progress.",
      status: IssueStatus.IN_PROGRESS,
      priority: IssuePriority.MEDIUM,
      order: 1,
      epicId: boardEpic.id,
      sprintId: sprint2.id,
    },
    {
      number: 5,
      title: "Implement drag and drop",
      description: "Evaluate dnd-kit vs pragmatic-drag-and-drop. Need cross-column moves and within-column reordering.",
      status: IssueStatus.OPEN,
      priority: IssuePriority.HIGH,
      order: 0,
      epicId: dndEpic.id,
      sprintId: sprint2.id,
    },
    {
      number: 7,
      title: "Write seed data script",
      description: "Realistic sample data for development and screenshots.",
      status: IssueStatus.REVIEW,
      priority: IssuePriority.MEDIUM,
      order: 0,
      epicId: setupEpic.id,
      sprintId: sprint2.id,
    },
    {
      number: 8,
      title: "Add epic filtering",
      description: "Filter the board by epic from the sidebar.",
      status: IssueStatus.DONE,
      priority: IssuePriority.MEDIUM,
      order: 0,
      epicId: boardEpic.id,
      sprintId: sprint2.id,
    },
    // Sprint 3 (planned)
    {
      number: 6,
      title: "Add keyboard shortcuts",
      description: "Arrow keys to navigate, Enter to open detail, M to move between columns.",
      status: IssueStatus.OPEN,
      priority: IssuePriority.LOW,
      order: 0,
      epicId: null,
      sprintId: sprint3.id,
    },
    // Backlog (no sprint)
    {
      number: 9,
      title: "Touch-friendly card moves",
      description: "Native drag and drop doesn't work on most phones; offer another way to move cards.",
      status: IssueStatus.OPEN,
      priority: IssuePriority.MEDIUM,
      order: 0,
      epicId: dndEpic.id,
      sprintId: null,
    },
    {
      number: 10,
      title: "Export sprint report as Markdown",
      description: null,
      status: IssueStatus.OPEN,
      priority: IssuePriority.LOW,
      order: 1,
      epicId: null,
      sprintId: null,
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

      const question = await prisma.comment.create({
        data: {
          issueId: created.id,
          body: "Should columns scroll **independently**, or should the whole board scroll?",
          createdAt: new Date(Date.now() - 2 * DAY_MS),
        },
      });
      await prisma.comment.create({
        data: {
          issueId: created.id,
          parentId: question.id,
          body: "Independently: the headers stay visible and you can compare columns.",
          createdAt: new Date(Date.now() - 1 * DAY_MS),
        },
      });
      await prisma.comment.create({
        data: {
          issueId: created.id,
          body: "Grid is in. Remaining work:\n- overflow scrolling\n- tablet check",
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        },
      });
    }
  }

  // A second project, so cross-project views (e.g. the epics overview) have
  // something to compare.
  const site = await prisma.project.create({
    data: { name: "Portfolio Site", description: "Personal site rebuild" },
  });
  const contentEpic = await prisma.epic.create({
    data: { name: "Content", color: "#ec4899", projectId: site.id }, // pink
  });
  const deployEpic = await prisma.epic.create({
    data: { name: "Deploy & Hosting", color: "#0ea5e9", projectId: site.id }, // sky
  });
  const siteSprint = await prisma.sprint.create({
    data: {
      projectId: site.id,
      number: 1,
      name: "Sprint 1",
      goal: "Launch a first version.",
      status: "ACTIVE",
      startDate: dayOffset(-3),
      endDate: dayOffset(11),
    },
  });
  const siteIssues = [
    { number: 1, title: "Write the about page", status: IssueStatus.DONE, priority: IssuePriority.MEDIUM, order: 0, epicId: contentEpic.id, sprintId: siteSprint.id },
    { number: 2, title: "Project case studies", status: IssueStatus.IN_PROGRESS, priority: IssuePriority.HIGH, order: 0, epicId: contentEpic.id, sprintId: siteSprint.id },
    { number: 3, title: "Set up custom domain", status: IssueStatus.OPEN, priority: IssuePriority.URGENT, order: 0, epicId: deployEpic.id, sprintId: siteSprint.id },
    { number: 4, title: "Add RSS feed", status: IssueStatus.OPEN, priority: IssuePriority.LOW, order: 0, epicId: contentEpic.id, sprintId: null },
  ];
  for (const issue of siteIssues) {
    await prisma.issue.create({ data: { ...issue, projectId: site.id } });
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
