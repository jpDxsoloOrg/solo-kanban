// "use client";

// import { IssueStatus } from "@prisma/client";
// import { IssueCard } from "./IssueCard";
// import type { IssueWithRelations } from "@/types";

// interface ColumnProps {
//   status: IssueStatus;
//   label: string;
//   issues: IssueWithRelations[];
// }

// const statusColors: Record<IssueStatus, string> = {
//   OPEN: "bg-gray-100 text-gray-700",
//   IN_PROGRESS: "bg-blue-100 text-blue-700",
//   REVIEW: "bg-amber-100 text-amber-700",
//   DONE: "bg-green-100 text-green-700",
// };
// const statusBorderColors: Record<IssueStatus, string> = {
//     OPEN: "border-t-gray-400",
//     IN_PROGRESS: "border-t-blue-500",
//     REVIEW: "border-t-amber-500",
//     DONE: "border-t-green-500",
//   };
  
//   const emptyMessages: Record<IssueStatus, string> = {
//     OPEN: "No open issues. Create one to get started.",
//     IN_PROGRESS: "Nothing in progress. Drag an issue here.",
//     REVIEW: "Review queue is empty.",
//     DONE: "No completed issues yet.",
//   };

// export function Column({ status, label, issues }: ColumnProps) {
//   return (
   
//     <div className={`flex flex-col h-full min-h-0 rounded-lg bg-gray-50 border-t-2 ${statusBorderColors[status]}`}>
//       {/* Column header: sticky, never scrolls */}
//       <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
//         <div className="flex items-center gap-2">
//           <span
//             className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[status]}`}
//           >
//             {label}
//           </span>
//           <span className="text-xs text-gray-400">{issues.length}</span>
//         </div>
//       </div>
//       {/* Card list: scrollable, container query context */}
//       <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 @container">
//         {issues.map((issue) => (
//           <IssueCard key={issue.id} issue={issue} />
//         ))}
//         {issues.length === 0 && (
//            <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-200 rounded-lg">
//            <p className="text-xs text-gray-400 text-center px-4">
//              {emptyMessages[status]}
//            </p>
//          </div>
//         )}
//       </div>
//     </div>
//   );
// }