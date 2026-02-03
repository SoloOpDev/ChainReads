// Points selection algorithm - determines which articles get bonus points
// Selects 3 random articles from first 3 rows (15 articles) daily

export function getPointsSelection(totalArticles: number): number[] {
  // First 3 rows = 15 articles (5 columns × 3 rows)
  const firstThreeRows = Math.min(15, totalArticles);
  
  if (firstThreeRows < 3) {
    // If less than 3 articles, return all indices
    return Array.from({ length: firstThreeRows }, (_, i) => i);
  }
  
  const selectedIndices: number[] = [];
  const available = Array.from({ length: firstThreeRows }, (_, i) => i);
  
  // Daily seed - changes at midnight
  const seed = Math.floor(Date.now() / 86400000); // 86400000ms = 24 hours
  
  // Seeded random function
  const seededRandom = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  
  // Select 3 random articles from first 15
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(seededRandom(seed + i) * available.length);
    selectedIndices.push(available[randomIndex]);
    available.splice(randomIndex, 1); // Remove to avoid duplicates
  }
  
  return selectedIndices.sort((a, b) => a - b); // Sort for consistency
}
