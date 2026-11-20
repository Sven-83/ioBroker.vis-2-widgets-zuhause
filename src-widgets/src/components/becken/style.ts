/*
 * Styles of the tank view, scoped below .zb (same look as the accepted preview, Jäger design).
 */
import { fonts } from '../../lib/theme';

const ID = 'vis-2-widgets-zuhause-becken';

const CSS = `
.zb{--zb-font:${fonts.text};--zb-num:${fonts.numbers};--zb-text:#ece9e1;--zb-text2:#a3a19a;--zb-muted:#7c7a74;--zb-bd:#36363b;
  --zb-swbg:#333338;--zb-swbd:#44444a;--zb-on:#f2c14e;--zb-onfg:#2a2108;--zb-ok:#6fe08a;--zb-rot:#e5484d;--zb-rotfg:#ffb3b3;
  position:relative;width:1050px;height:575px;background:var(--bg,#232325);
  overflow:hidden;border-radius:22px;font-family:var(--zb-font);color:var(--zb-text);user-select:none;-webkit-user-select:none;
  box-shadow:0 30px 80px rgba(0,0,0,.6)}
.zb *{box-sizing:border-box}
.zb svg.lay{position:absolute;left:0;top:0;width:730px;height:575px}
.zb canvas.tank{position:absolute;left:170px;top:86px;width:330px;height:204px}
.zb .co{cursor:pointer}
.zb .co text{font:700 13.5px var(--zb-font);fill:#fff}
.zb .co .v{font:500 11.5px var(--zb-font);fill:#cfccc4}
.zb .co rect.bg{fill:rgba(38,40,46,.96);stroke:rgba(255,255,255,.2)}
.zb .co.rot rect.bg{stroke:#e5484d;fill:rgba(80,20,24,.85)}
.zb .co.rot .v{fill:#ffb3b3}
.zb .hot{cursor:pointer}
.zb .lead{stroke:rgba(236,233,225,.8);stroke-width:1.2;fill:none}
.zb .lead-halo{stroke:rgba(10,10,14,.75);stroke-width:4;fill:none;stroke-linejoin:round}
.zb .side{position:absolute;right:14px;top:14px;bottom:14px;width:290px;display:flex;flex-direction:column;gap:8px}
.zb .head{display:flex;align-items:center;gap:10px}
.zb .head .t{flex:1}.zb .head .k{font-size:10.5px;letter-spacing:.14em;color:var(--zb-text2);font-weight:600}.zb .head h2{margin:0;font-size:20px;font-weight:600}
.zb .x{width:44px;height:44px;border-radius:12px;border:1px solid var(--zb-swbd);background:var(--zb-swbg);color:var(--zb-text);font-size:17px;cursor:pointer;flex:none}
.zb .card{background:rgba(43,43,47,.85);border:1px solid var(--zb-bd);border-radius:16px;padding:10px 12px;cursor:pointer;display:flex;flex-direction:column;gap:6px}
.zb .card .ct{display:flex;justify-content:space-between;font-size:10.5px;letter-spacing:.1em;color:var(--zb-text2);font-weight:600}
.zb .num{font:600 30px/1 var(--zb-num)}
.zb .num small{font-size:15px;color:var(--zb-text2);margin-left:3px}
.zb .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.zb .stat{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.zb .small{font-size:11px;color:var(--zb-text2);line-height:1.4}
.zb .bars{display:flex;flex-direction:column;gap:5px}
.zb .bar{display:grid;grid-template-columns:66px 1fr 44px;align-items:center;gap:8px;font-size:11.5px}
.zb .bar .tr{height:7px;border-radius:4px;background:#35353a;overflow:hidden}
.zb .bar .tr i{display:block;height:100%;border-radius:4px}
.zb .bar b{font:600 13px var(--zb-num);text-align:right}
.zb .dl{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:6px;font-size:10px;color:var(--zb-text2)}
.zb .day24{position:relative;height:11px;border-radius:5px;background:#333338;overflow:hidden}
.zb .day24 i{position:absolute;top:0;bottom:0}
.zb .day24 .now{width:2px;background:#fff;box-shadow:0 0 6px #fff}
.zb .ticks{display:flex;justify-content:space-between;font-size:9.5px;color:var(--zb-muted);margin-left:40px}
.zb .foot{margin-top:auto;font-size:10.5px;color:var(--zb-muted);display:flex;justify-content:space-between}
.zb .led{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.zb .led.ok{background:var(--zb-ok);box-shadow:0 0 6px var(--zb-ok)}
.zb .led.rot{background:var(--zb-rot);box-shadow:0 0 8px var(--zb-rot);animation:zb-rec 1s infinite}
.zb .led.gelb{background:var(--zb-on);box-shadow:0 0 6px var(--zb-on)}
.zb .led.aus{background:#55555c}
@keyframes zb-rec{0%,100%{opacity:1}50%{opacity:.25}}
.zb .sw8{display:inline-block;width:11px;height:11px;border-radius:50%;vertical-align:-1px;margin-right:6px}
.zb .sheet{position:absolute;top:10px;right:10px;bottom:10px;width:340px;background:#202125;border:1px solid rgba(255,255,255,.12);border-radius:22px;
  padding:14px 14px 10px;display:flex;flex-direction:column;gap:8px;z-index:50;box-shadow:0 20px 60px rgba(0,0,0,.55);animation:zb-in .28s cubic-bezier(.2,.8,.2,1)}
@keyframes zb-in{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}
.zb .sheet .sh{display:flex;align-items:center;gap:10px}
.zb .sheet .sh h4{margin:0;font-size:18px;font-weight:600}
.zb .sheet .sh .k{font-size:10.5px;letter-spacing:.1em;color:var(--zb-text2);font-weight:600;display:block}
.zb .sheet .body{flex:1;display:flex;flex-direction:column;gap:8px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;overscroll-behavior:contain}
.zb .sheet .body::-webkit-scrollbar{display:none}
.zb .sheet .msg{font:500 10.5px/1.35 var(--zb-font);color:var(--zb-text2);border-top:1px solid var(--zb-bd);padding-top:6px;min-height:22px}
.zb .big{display:flex;align-items:baseline;gap:8px}
.zb .big b{font:600 34px var(--zb-num)}
.zb .big span{color:var(--zb-text2);font-size:13px}
.zb .box{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:8px 11px;display:flex;flex-direction:column;gap:4px;flex:none}
.zb .line{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;min-height:30px}
.zb .line .k{color:var(--zb-text2);white-space:nowrap}
.zb .sw{position:relative;width:58px;height:32px;border-radius:16px;border:1px solid var(--zb-swbd);background:var(--zb-swbg);cursor:pointer;flex:none;overflow:hidden;touch-action:none;padding:0}
.zb .sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#cfccc3;transition:left .15s}
.zb .sw.on{background:var(--zb-on);border-color:var(--zb-on)}
.zb .sw.on::after{left:29px;background:var(--zb-onfg)}
.zb .sw .hold,.zb .holdbtn .hold{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(229,72,77,.6)}
.zb .sw.locked,.zb .dis{opacity:.4;pointer-events:none}
.zb .seg2{display:flex;gap:4px;background:var(--zb-swbg);border:1px solid var(--zb-swbd);border-radius:10px;padding:3px;flex:none}
.zb .seg2 button{flex:1;height:30px;border:0;border-radius:8px;background:transparent;color:var(--zb-text2);font:600 12.5px var(--zb-font);cursor:pointer}
.zb .seg2 button.on{background:var(--zb-on);color:var(--zb-onfg)}
.zb .seg2.tabs{background:transparent;border-color:transparent;padding:0;border-bottom:1px solid var(--zb-bd);border-radius:0}
.zb .seg2.tabs button{border-radius:8px 8px 0 0}
.zb .step{display:flex;align-items:center;gap:4px}
.zb .step button{width:30px;height:30px;border-radius:8px;border:1px solid var(--zb-swbd);background:var(--zb-swbg);color:var(--zb-text);font:600 15px var(--zb-font);cursor:pointer;padding:0}
.zb .step b{min-width:46px;text-align:center;font:600 15px var(--zb-num);white-space:nowrap}
.zb .step button:disabled{opacity:.35}
.zb .btn{position:relative;overflow:hidden;height:30px;padding:0 10px;border-radius:10px;border:1px solid var(--zb-swbd);background:var(--zb-swbg);color:var(--zb-text);font:600 12px var(--zb-font);cursor:pointer;white-space:nowrap}
.zb .btn.prim{background:var(--zb-on);border-color:var(--zb-on);color:var(--zb-onfg)}
.zb .btn.wide{width:100%;height:38px;font-size:13px;flex:none}
.zb .btn:disabled{opacity:.4}
.zb .holdbtn .hold{background:rgba(242,193,78,.45)}
.zb .del{width:24px;height:24px;border:0;background:transparent;color:var(--zb-text2);font-size:12px;cursor:pointer;padding:0}
.zb input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;margin:0}
.zb input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:linear-gradient(90deg,#333338,var(--c,#888))}
.zb input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--zb-text);margin-top:-7px;border:3px solid #232325}
.zb .sl{display:grid;grid-template-columns:44px 1fr 34px;align-items:center;gap:8px;font-size:12px;color:var(--zb-text2)}
.zb .sl.wide{grid-template-columns:44px 1fr 80px}
.zb .sl b{color:var(--zb-text);font:600 15px var(--zb-num);text-align:right;white-space:nowrap}
.zb .presets{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.zb .presets button{display:flex;align-items:center;gap:7px;height:32px;padding:0 6px 0 9px;border-radius:9px;border:1px solid var(--zb-swbd);background:var(--zb-swbg);color:var(--zb-text);font:600 12px var(--zb-font);cursor:pointer;text-align:left}
.zb .presets button.on{border-color:var(--zb-on)}
.zb .presets i{width:12px;height:12px;border-radius:50%;flex:none}
.zb .presets .pn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zb .zrow{display:grid;grid-template-columns:10px 1fr auto;align-items:center;gap:8px;width:100%;min-height:26px;padding:3px 8px;border:0;border-radius:8px;background:transparent;color:var(--zb-text);font:600 12.5px var(--zb-font);text-align:left;cursor:pointer}
.zb .zrow .zt{font-weight:500;font-size:11.5px;color:var(--zb-text2);text-align:right;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zb .zrow.rot .zt{color:var(--zb-rotfg)}.zb .zrow.gelb .zt{color:#f2d48a}
.zb .zg{font-size:10px;letter-spacing:.12em;color:var(--zb-text2);font-weight:600;margin:4px 2px 2px}
.zb .rings{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 2px}
.zb .ring{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:10px;text-align:center;line-height:1.2;cursor:pointer;border-radius:10px;padding:2px 0;background:transparent;border:0;color:var(--zb-text)}
.zb .ring.sel{background:rgba(242,193,78,.12);outline:1px solid rgba(242,193,78,.5)}
.zb .ring .rn{font-weight:600;font-size:10.5px}
.zb .ring .rd{color:var(--zb-text2)}.zb .ring .rd.rot{color:var(--zb-rotfg)}.zb .ring .rd.gelb{color:var(--zb-on)}
.zb .sbar{display:flex;align-items:center;justify-content:center;gap:14px;flex:none}
.zb .sbar span{font-size:10.5px;color:var(--zb-text2);min-width:70px;text-align:center}
.zb .sarrow{width:64px;height:32px;border-radius:16px;border:1px solid rgba(242,193,78,.6);background:rgba(255,255,255,.04);color:#f2c14e;font-size:13px;cursor:pointer}
.zb .sarrow:disabled{opacity:.3}
.zb .hint{font-size:11px;color:#f2d48a;line-height:1.35}
.zb input.name{height:30px;border-radius:8px;border:1px solid var(--zb-swbd);background:#1f2023;color:var(--zb-text);font:600 13px var(--zb-font);padding:0 8px;width:150px}
@media (prefers-reduced-motion:reduce){.zb *{animation:none!important}}
`;

/** Registers the styles of the tank view once per page */
export function ensureBeckenStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}
