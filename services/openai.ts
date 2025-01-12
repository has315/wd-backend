
// function adjustLessonCount(analysis: CourseAnalysis, targetLessons: number): CourseAnalysis {
//   let currentLessons = analysis.topics.reduce((acc, topic) => acc + topic.sections.length, 0);

//   if (currentLessons === targetLessons) {
//     return analysis;
//   }

//   if (currentLessons > targetLessons) {
//     while (currentLessons > targetLessons) {
//       const smallestTopicIndex = analysis.topics
//         .map((topic, index) => ({ index, size: topic.sections.length }))
//         .filter(({ size }) => size >= 2)
//         .sort((a, b) => a.size - b.size)[0]?.index;

//       if (smallestTopicIndex === undefined) {
//         const newTopic = {
//           title: "Combined Insights",
//           sections: [],
//           relatedNoteIds: []
//         };
//         analysis.topics.push(newTopic);
//         continue;
//       }

//       const topic = analysis.topics[smallestTopicIndex];
//       const last = topic.sections.pop()!;
//       const secondLast = topic.sections.pop()!;

//       const mergedSection: CourseSection = {
//         number: secondLast.number,
//         title: `${secondLast.title} & ${last.title}`,
//         learningContent: `${secondLast.learningContent}\n\nAdditionally: ${last.learningContent}`,
//         story: `${secondLast.story}\n\nRelated story: ${last.story}`,
//         reflectionQuestion: `${secondLast.reflectionQuestion}\nAlso consider: ${last.reflectionQuestion}`,
//         noteIds: [...new Set([...secondLast.noteIds, ...last.noteIds])],
//         selected: secondLast.selected || last.selected
//       };

//       topic.sections.push(mergedSection);
//       topic.relatedNoteIds = [...new Set([...topic.relatedNoteIds, ...last.noteIds, ...secondLast.noteIds])];
//       currentLessons--;
//     }
//   }

//   if (currentLessons < targetLessons) {
//     while (currentLessons < targetLessons) {
//       let longestSection: CourseSection | null = null;
//       let longestTopicIndex = 0;
//       let longestSectionIndex = 0;

//       analysis.topics.forEach((topic, topicIndex) => {
//         topic.sections.forEach((section, sectionIndex) => {
//           if (!longestSection || section.learningContent.length > longestSection.learningContent.length) {
//             longestSection = section;
//             longestTopicIndex = topicIndex;
//             longestSectionIndex = sectionIndex;
//           }
//         });
//       });

//       if (!longestSection) {
//         break;
//       }

//       const originalSection = analysis.topics[longestTopicIndex].sections[longestSectionIndex];
//       const midPoint = Math.floor(originalSection.learningContent.split('\n').length / 2);
//       const contentParts = originalSection.learningContent.split('\n');

//       const section1: CourseSection = {
//         ...originalSection,
//         learningContent: contentParts.slice(0, midPoint).join('\n'),
//         title: `${originalSection.title} (Part 1)`,
//         number: `${originalSection.number}a`
//       };

//       const section2: CourseSection = {
//         ...originalSection,
//         learningContent: contentParts.slice(midPoint).join('\n'),
//         title: `${originalSection.title} (Part 2)`,
//         number: `${originalSection.number}b`
//       };

//       analysis.topics[longestTopicIndex].sections.splice(longestSectionIndex, 1, section1, section2);
//       currentLessons++;
//     }
//   }

//   let sectionNumber = 1;
//   analysis.topics.forEach((topic, topicIndex) => {
//     topic.sections.forEach((section, sectionIndex) => {
//       section.number = `${topicIndex + 1}.${sectionIndex + 1}`;
//     });
//   });

//   return analysis;
// }

