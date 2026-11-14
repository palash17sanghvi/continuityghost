export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({geminiConfigured:Boolean(process.env.GEMINI_API_KEY),model:process.env.GEMINI_MODEL || 'gemini-2.5-flash',paidAnalysisEnabled:process.env.ALLOW_PAID_ANALYSIS === 'true',memoryConfigured:false,databaseConfigured:false},{headers:{'Cache-Control':'no-store'}});
}
