// "use client";

// import { Card, CardContent } from "@dxsolo/ui";
// import type { IssueWithRelations } from "@/types";
// import { IssuePriority } from "@prisma/client";

// interface IssueCardProps {
//   issue: IssueWithRelations;
// }

// const priorityConfig: Record<
//   IssuePriority,
//   { label: string; className: string }
// > = {
//   URGENT: { label: "Urgent", className: "bg-red-100 text-red-700" },
//   HIGH: { label: "High", className: "bg-orange-100 text-orange-700" },
//   MEDIUM: { label: "Med", className: "bg-yellow-100 text-yellow-700" },
//   LOW: { label: "Low", className: "bg-gray-100 text-gray-500" },
// };

// export function IssueCard({ issue }: IssueCardProps) {
//   const priority = priorityConfig[issue.priority];
//   const completedSubtasks = issue.subtasks.filter((s) => s.completed).length;
//   const totalSubtasks = issue.subtasks.length;

//   return (
//     <Card className="cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow">
//       <CardContent className="p-3">
//         {/* Title */}
//         <h3 className="text-sm font-medium leading-snug">{issue.title}</h3>

//         {/* Meta row: priority + epic label */}
//         <div className="flex items-center gap-2 mt-2 flex-wrap">
//           <span
//             className={`text-xs font-medium px-1.5 py-0.5 rounded ${priority.className}`}
//           >
//             {priority.label}
//           </span>

//           {/* Epic label: hidden when container is too narrow */}
//           {issue.epic && (
//             <span
//               className="text-xs px-1.5 py-0.5 rounded hidden @[200px]:inline-block"
//               style={{ backgroundColor: `${issue.epic.color}20`, color: issue.epic.color }}
//             >
//               {issue.epic.name}
//             </span>
//           )}
//         </div>

//         {/* Subtask progress */}
//         {totalSubtasks > 0 && (
//           <div className="mt-2 flex items-center gap-2">
//             <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
//               <div
//                 className="h-full bg-green-500 rounded-full transition-all"
//                 style={{
//                   width: `${(completedSubtasks / totalSubtasks) * 100}%`,
//                 }}
//               />
//             </div>
//             <span className="text-xs text-gray-400">
//               {completedSubtasks}/{totalSubtasks}
//             </span>
//           </div>
//         )}
//       </CardContent>
//     </Card>
//   );
// }