export default async function(req,res){
  const x=req.body||{};
  const checks={mtf:!!x.mtfAligned,ob:!!x.obValid,fvg:!!x.fvgValid,ema:!!x.emaAligned,rsi:!!x.rsiValid,atr:!!x.atrValid,session:!!x.sessionValid,spread:x.spreadValid===null||x.spreadValid===undefined?null:!!x.spreadValid};
  const weights={mtf:22,ob:18,fvg:15,ema:15,rsi:12,atr:10,session:8,spread:5};
  let raw=0,max=0; for(const[k,w]of Object.entries(weights)){if(k==='spread'&&checks.spread===null)continue;max+=w;if(checks[k])raw+=w;}
  const confidence=max?Math.round(raw/max*100):0;
  const classification=confidence>=90?'PREMIUM':confidence>=80?'HIGH_CONFIDENCE':confidence>=70?'VALID':confidence>=60?'WATCH':'NO_TRADE';
  const liveQualified=confidence>=80&&checks.mtf&&checks.ob&&checks.spread===true;
  res.json({modelVersion:'2.0-live',confidence,classification,liveQualified,checks,policy:{minimumConfidence:80,requires:['mtf','ob','spread'],riskCapPct:3,execution:'MT5_BRIDGE_V5_REQUIRED'}});
}