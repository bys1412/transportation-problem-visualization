/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Play, 
  ChevronRight, 
  RotateCcw, 
  CheckCircle2, 
  Settings2,
  Table as TableIcon,
  Calculator,
  ArrowRight,
  Info,
  Layers,
  Activity
} from 'lucide-react';
import * as Solver from './solver';
import { PasswordGate } from './components/PasswordGate';

type AppStep = 'setup' | 'solving' | 'finished';

export default function App() {
  // Setup State
  const [rowCount, setRowCount] = useState(3);
  const [colCount, setColCount] = useState(3);
  const [costs, setCosts] = useState<number[][]>([[0,0,0],[0,0,0],[0,0,0]]);
  const [supply, setSupply] = useState<number[]>([10, 20, 30]);
  const [demand, setDemand] = useState<number[]>([15, 25, 20]);
  const [initMethod, setInitMethod] = useState<Solver.InitMethod>('min_cost');

  // Solving State
  const [appStep, setAppStep] = useState<AppStep>('setup');
  const [viewingIndex, setViewingIndex] = useState(0);
  const [history, setHistory] = useState<Solver.TransportState[]>([]);

  const currentState = history[viewingIndex] || null;
  const latestState = history[history.length - 1] || null;

  // Sync costs/supply/demand when row/col count changes
  useEffect(() => {
    setCosts(prev => {
      const newCosts = Array.from({ length: rowCount }, (_, i) => 
        Array.from({ length: colCount }, (_, j) => prev[i]?.[j] ?? 0)
      );
      return newCosts;
    });
    setSupply(prev => {
      const newSupply = Array.from({ length: rowCount }, (_, i) => prev[i] ?? 0);
      return newSupply;
    });
    setDemand(prev => {
      const newDemand = Array.from({ length: colCount }, (_, j) => prev[j] ?? 0);
      return newDemand;
    });
  }, [rowCount, colCount]);

  const randomizeData = () => {
    const newCosts = Array.from({ length: rowCount }, () => 
      Array.from({ length: colCount }, () => Math.floor(Math.random() * 20) + 1)
    );
    const total = 60 + Math.floor(Math.random() * 100); 
    
    const distSupply = Array.from({ length: rowCount }, () => 5);
    let remainingS = total - (rowCount * 5);
    for (let i = 0; i < rowCount - 1; i++) {
      const take = Math.floor(Math.random() * (remainingS / 1.5));
      distSupply[i] += take;
      remainingS -= take;
    }
    distSupply[rowCount - 1] += Math.max(0, remainingS);

    const distDemand = Array.from({ length: colCount }, () => 5);
    let remainingD = total - (colCount * 5);
    for (let j = 0; j < colCount - 1; j++) {
      const take = Math.floor(Math.random() * (remainingD / 1.5));
      distDemand[j] += take;
      remainingD -= take;
    }
    distDemand[colCount - 1] += Math.max(0, remainingD);

    setCosts(newCosts);
    setSupply(distSupply);
    setDemand(distDemand);
  };

  const handleStart = () => {
    const balanced = Solver.balanceProblem(costs, supply, demand);
    const m = balanced.supply.length;
    const n = balanced.demand.length;
    
    // To show the process, we'll start with an empty allocation
    const emptyAllocation: (number | null)[][] = Array.from({ length: m }, () => new Array(n).fill(null));
    const initialProcessStates: Solver.TransportState[] = [];

    const emptyState: Solver.TransportState = {
      costs: balanced.costs,
      supply: balanced.supply,
      demand: balanced.demand,
      allocation: emptyAllocation,
      u: new Array(m).fill(null),
      v: new Array(n).fill(null),
      reducedCosts: Array.from({ length: m }, () => new Array(n).fill(null)),
      isOptimal: false,
      totalCost: 0,
      iteration: 0,
      message: `开始初始化运输表 (${initMethod === 'northwest' ? '西北角法' : initMethod === 'min_cost' ? '最小元素法' : '伏格尔法'})`
    };
    initialProcessStates.push(emptyState);

    // Step-by-step BFS
    let currentAllocation = emptyAllocation.map(row => [...row]);
    const s = [...balanced.supply];
    const d = [...balanced.demand];

    if (initMethod === 'northwest') {
      let i = 0, j = 0;
      let step = 1;
      while (i < m && j < n) {
        const amount = Math.min(s[i], d[j]);
        currentAllocation[i][j] = amount;
        const prevS = s[i];
        const prevD = d[j];
        s[i] -= amount;
        d[j] -= amount;
        
        initialProcessStates.push({
          ...emptyState,
          allocation: currentAllocation.map(row => [...row]),
          iteration: step++,
          message: `西北角法: 在 (${i+1}, ${j+1}) 分配 ${amount} 单位 (Min(${prevS}, ${prevD}))`,
          totalCost: Solver.calculateTotalCost(balanced.costs, currentAllocation)
        });

        if (s[i] === 0 && i < m - 1) i++;
        else j++;
      }
    } else if (initMethod === 'min_cost') {
      const cells: Solver.Cell[] = [];
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) cells.push({ row: i, col: j });
      cells.sort((a, b) => balanced.costs[a.row][a.col] - balanced.costs[b.row][b.col]);

      let step = 1;
      for (const cell of cells) {
        const { row: i, col: j } = cell;
        if (s[i] > 0 && d[j] > 0) {
          const amount = Math.min(s[i], d[j]);
          currentAllocation[i][j] = amount;
          const prevS = s[i];
          const prevD = d[j];
          s[i] -= amount;
          d[j] -= amount;

          initialProcessStates.push({
            ...emptyState,
            allocation: currentAllocation.map(row => [...row]),
            iteration: step++,
            message: `最小元素法: 在 (${i+1}, ${j+1}) 分配 ${amount} 单位 (对应最小运费 ${balanced.costs[i][j]})`,
            totalCost: Solver.calculateTotalCost(balanced.costs, currentAllocation)
          });
        }
      }
    } else if (initMethod === 'vogel') {
      const rowActive = new Array(m).fill(true);
      const colActive = new Array(n).fill(true);
      let step = 1;

      while (rowActive.filter(v => v).length > 0 && colActive.filter(v => v).length > 0) {
        const rowPenalties = rowActive.map((active, i) => {
          if (!active) return -1;
          const sorted = balanced.costs[i].map((c, j) => ({ c, j })).filter(item => colActive[item.j]).sort((a, b) => a.c - b.c);
          if (sorted.length === 0) return -1;
          if (sorted.length === 1) return sorted[0].c;
          return sorted[1].c - sorted[0].c;
        });
        const colPenalties = colActive.map((active, j) => {
          if (!active) return -1;
          const sorted = balanced.costs.map((row, i) => ({ c: row[j], i })).filter(item => rowActive[item.i]).sort((a, b) => a.c - b.c);
          if (sorted.length === 0) return -1;
          if (sorted.length === 1) return sorted[0].c;
          return sorted[1].c - sorted[0].c;
        });

        const maxR = Math.max(...rowPenalties);
        const maxC = Math.max(...colPenalties);
        let r, c;

        if (maxR >= maxC) {
          r = rowPenalties.indexOf(maxR);
          c = balanced.costs[r].map((c, j) => ({ c, j })).filter(item => colActive[item.j]).sort((a, b) => a.c - b.c)[0].j;
        } else {
          c = colPenalties.indexOf(maxC);
          r = balanced.costs.map((row, i) => ({ c: row[c], i })).filter(item => rowActive[item.i]).sort((a, b) => a.c - b.c)[0].i;
        }

        const amount = Math.min(s[r], d[c]);
        currentAllocation[r][c] = amount;
        s[r] -= amount;
        d[c] -= amount;

        initialProcessStates.push({
          ...emptyState,
          allocation: currentAllocation.map(row => [...row]),
          iteration: step++,
          message: `伏格尔法: 选中 (${r+1}, ${c+1}) 分配 ${amount} 单位 (最大罚数: ${Math.max(maxR, maxC)})`,
          totalCost: Solver.calculateTotalCost(balanced.costs, currentAllocation)
        });

        if (s[r] === 0) rowActive[r] = false;
        else colActive[c] = false;
      }
    }

    // Degeneracy treatment (m+n-1)
    let basicCount = 0;
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (currentAllocation[i][j] !== null) basicCount++;
    if (basicCount < m + n - 1) {
      for (let i = 0; i < m && basicCount < m + n - 1; i++) {
        for (let j = 0; j < n && basicCount < m + n - 1; j++) {
          if (currentAllocation[i][j] === null) {
            currentAllocation[i][j] = 0;
            basicCount++;
            initialProcessStates.push({
              ...emptyState,
              allocation: currentAllocation.map(row => [...row]),
              iteration: initialProcessStates.length,
              message: `退化处理: 引入零值基变量在 (${i+1}, ${j+1}) 以满足 m+n-1 条件`,
              totalCost: Solver.calculateTotalCost(balanced.costs, currentAllocation)
            });
          }
        }
      }
    }

    // Final initialization state with Potentials
    const { u, v } = Solver.solveMODIPotentials(balanced.costs, currentAllocation);
    const reducedCosts = Solver.solveReducedCosts(balanced.costs, u, v, currentAllocation);
    const entering = Solver.findEnteringCell(reducedCosts);

    const finalInitState: Solver.TransportState = {
      costs: balanced.costs,
      supply: balanced.supply,
      demand: balanced.demand,
      allocation: currentAllocation,
      u,
      v,
      reducedCosts,
      isOptimal: entering === null,
      totalCost: Solver.calculateTotalCost(balanced.costs, currentAllocation),
      iteration: initialProcessStates.length,
      message: entering === null ? '初始解即为最优解' : '初始基解生成完毕，进入 MODI 优化阶段',
      enteringCell: entering || undefined
    };
    initialProcessStates.push(finalInitState);

    setHistory(initialProcessStates);
    setViewingIndex(0);
    setAppStep('solving');
  };

  const nextStep = useCallback(() => {
    // If viewing an old step, jump to the last one first
    if (viewingIndex !== history.length - 1) {
      setViewingIndex(history.length - 1);
      return;
    }

    if (!latestState || latestState.isOptimal) return;

    const { enteringCell, allocation, costs: balancedCosts } = latestState;
    if (!enteringCell) return;

    const loop = Solver.findClosedLoop(allocation, enteringCell);
    if (!loop) {
      const failedState = { ...latestState, isOptimal: true, message: '无法找到闭回路，迭代停止' };
      setHistory(prev => [...prev.slice(0, -1), failedState]);
      return;
    }

    let theta = Infinity;
    let leaving: Solver.Cell | null = null;
    for (let i = 1; i < loop.length; i += 2) {
      const cell = loop[i];
      const val = allocation[cell.row][cell.col] || 0;
      if (val < theta) {
        theta = val;
        leaving = cell;
      }
    }

    const newAllocation = allocation.map(row => [...row]);
    loop.forEach((cell, idx) => {
      const currentVal = newAllocation[cell.row][cell.col] || 0;
      if (idx % 2 === 0) {
        newAllocation[cell.row][cell.col] = currentVal + theta;
      } else {
        const newVal = currentVal - theta;
        newAllocation[cell.row][cell.col] = newVal === 0 ? null : newVal;
      }
    });

    if (leaving) {
        let zeroCount = 0;
        for(let i=1; i<loop.length; i+=2) {
            const cell = loop[i];
            if ((allocation[cell.row][cell.col] || 0) === theta) zeroCount++;
        }
        if (zeroCount > 1) {
            let firstReached = false;
            for(let i=1; i<loop.length; i+=2) {
                const cell = loop[i];
                if ((allocation[cell.row][cell.col] || 0) === theta) {
                    if (!firstReached) firstReached = true;
                    else newAllocation[cell.row][cell.col] = 0;
                }
            }
        }
    }

    const { u, v } = Solver.solveMODIPotentials(balancedCosts, newAllocation);
    const reducedCosts = Solver.solveReducedCosts(balancedCosts, u, v, newAllocation);
    const nextEntering = Solver.findEnteringCell(reducedCosts);

    const nextState: Solver.TransportState = {
      costs: balancedCosts,
      supply: latestState.supply,
      demand: latestState.demand,
      allocation: newAllocation,
      u,
      v,
      reducedCosts,
      isOptimal: nextEntering === null,
      totalCost: Solver.calculateTotalCost(balancedCosts, newAllocation),
      iteration: latestState.iteration + 1,
      currentLoop: loop,
      enteringCell: nextEntering || undefined,
      leavingCell: leaving || undefined,
      theta,
      message: nextEntering === null ? `已得出最优方案，最小总运费为 ¥${Solver.calculateTotalCost(balancedCosts, newAllocation)}` : `闭回路调整完成。入基空格 (${enteringCell.row + 1}, ${enteringCell.col + 1}), θ=${theta}`,
    };

    setHistory(prev => [...prev, nextState]);
    setViewingIndex(history.length);
    if (nextState.isOptimal) setAppStep('finished');
  }, [viewingIndex, history, latestState]);

  const reset = () => {
    setAppStep('setup');
    setHistory([]);
    setViewingIndex(0);
  };

  return (
    <PasswordGate>
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-800 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white/40"></div><div className="w-2 h-2 bg-white"></div>
              <div className="w-2 h-2 bg-white"></div><div className="w-2 h-2 bg-white/40"></div>
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight">运筹学求解器 <span className="font-normal text-slate-300 mx-1">|</span> <span className="text-slate-500 font-medium">表上作业法</span></h1>
        </div>
        
        <div className="flex gap-4 items-center">
          {appStep !== 'setup' && (
            <>
              <span className="text-sm text-slate-400 font-medium italic hidden md:inline">
                {currentState?.isOptimal ? '最优解确定' : `正在寻找最优解 (迭代: ${currentState?.iteration.toString().padStart(2, '0')})`}
              </span>
              <button 
                onClick={reset}
                className="px-4 py-2 bg-white border border-slate-300 rounded text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw size={14} />
                重置
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar: Process Flow & Stats */}
        <aside className="w-80 bg-white border-r border-slate-200 p-6 flex flex-col gap-8 shrink-0 overflow-y-auto">
          <section className="flex-1 overflow-hidden flex flex-col">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 shrink-0">迭代过程 (Iterations)</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {history.map((state, idx) => (
                <button
                  key={idx}
                  onClick={() => setViewingIndex(idx)}
                  className={`w-full p-4 rounded-xl text-left transition-all border group cursor-pointer ${
                    viewingIndex === idx 
                    ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-100' 
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${viewingIndex === idx ? 'text-indigo-200' : 'text-slate-400'}`}>
                      Step {state.iteration.toString().padStart(2, '0')}
                    </span>
                    {state.isOptimal && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${viewingIndex === idx ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-600'}`}>OPTIMAL</span>
                    )}
                  </div>
                  <div className={`font-mono font-bold text-sm ${viewingIndex === idx ? 'text-white' : 'text-slate-700'}`}>
                    ¥ {state.totalCost.toLocaleString()}
                  </div>
                  <div className={`text-[10px] mt-1 line-clamp-2 leading-relaxed ${viewingIndex === idx ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {state.message}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {appStep !== 'setup' && (
            <section className="mt-auto">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-inner">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">当前总运费 (Z)</p>
                <p className="text-3xl font-mono font-black text-slate-900 tabular-nums">
                  <span className="text-sm font-normal text-slate-400 mr-1 italic">¥</span>
                  {currentState?.totalCost}
                </p>
                <div className="mt-4 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: currentState?.isOptimal ? '100%' : '65%' }}
                   className={`h-full transition-all duration-500 ${currentState?.isOptimal ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  ></motion.div>
                </div>
                <p className="text-[10px] font-bold text-slate-500 mt-3 uppercase">收敛状态: {currentState?.isOptimal ? 'OPTIMAL' : 'REDUCING'}</p>
              </div>
            </section>
          )}

          {appStep === 'setup' && (
            <section className="mt-auto space-y-4">
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <h4 className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-1">
                  <Info size={12} /> 算法说明
                </h4>
                <p className="text-[11px] text-indigo-700 leading-relaxed">
                  本工具使用位势法 (MODI) 计算对偶变量，并通过闭回路法调整基解。若行列产销不平衡，系统会自动引入虚拟销地或产地。
                </p>
              </div>
              <button 
                onClick={handleStart}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 group cursor-pointer"
              >
                <Play size={18} fill="currentColor" />
                初始化运输表
                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </section>
          )}
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 p-8 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {appStep === 'setup' ? (
              <motion.div 
                key="setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex justify-between items-end mb-8 shrink-0">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">运输平衡表配置</h2>
                    <p className="text-sm text-slate-500 mt-1 font-medium">配置资源产销矩阵的基础参数与单位运费</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 px-3 shadow-sm">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">布局矩阵</span>
                       <div className="flex items-center gap-2">
                          <button onClick={() => setRowCount(Math.max(2, rowCount - 1))} className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">-</button>
                          <span className="font-mono font-bold text-sm w-6 text-center">{rowCount}</span>
                          <button onClick={() => setRowCount(Math.min(6, rowCount + 1))} className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">+</button>
                          <span className="mx-1 text-slate-300">×</span>
                          <button onClick={() => setColCount(Math.max(2, colCount - 1))} className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">-</button>
                          <span className="font-mono font-bold text-sm w-6 text-center">{colCount}</span>
                          <button onClick={() => setColCount(Math.min(6, colCount + 1))} className="w-6 h-6 flex items-center justify-center bg-slate-50 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">+</button>
                       </div>
                    </div>
                    
                    <select 
                      value={initMethod}
                      onChange={(e) => setInitMethod(e.target.value as Solver.InitMethod)}
                      className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:border-indigo-300 transition-colors"
                    >
                      <option value="min_cost">最小元素法 (Min Cost)</option>
                      <option value="northwest">西北角法 (Northwest)</option>
                      <option value="vogel">伏格尔法 (Vogel)</option>
                    </select>

                    <button 
                      onClick={randomizeData}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                    >
                      <Layers size={14} />
                      随机数据
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 flex flex-col overflow-hidden min-h-0">
                  <div className="overflow-auto flex-1">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200">
                          <th className="p-5 border-r border-slate-200"></th>
                          {Array.from({ length: colCount }).map((_, j) => (
                            <th key={j} className="p-5 text-center font-bold text-[10px] uppercase tracking-widest text-slate-400 border-r border-slate-200 min-w-[120px]">D{j + 1} (目的地)</th>
                          ))}
                          <th className="p-5 text-center font-bold text-[10px] uppercase tracking-widest text-indigo-600 bg-indigo-50/50 min-w-[120px]">供应量 (ai)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costs.map((rowArr, i) => (
                          <tr key={i} className="border-b border-slate-100 group">
                            <td className="p-5 flex items-center justify-center font-bold text-slate-500 bg-slate-50/30 border-r border-slate-200 italic font-mono">S{i + 1}</td>
                            {rowArr.map((cost, j) => (
                              <td key={j} className="p-3 border-r border-slate-100 relative group-hover:bg-slate-50/50 focus-within:bg-indigo-50/30 transition-colors">
                                <input 
                                  type="number"
                                  value={cost}
                                  onChange={(e) => {
                                    const newCosts = [...costs];
                                    newCosts[i][j] = parseInt(e.target.value) || 0;
                                    setCosts(newCosts);
                                  }}
                                  className="w-full p-4 bg-transparent border-0 outline-none text-center font-mono text-xl font-bold text-slate-900 tabular-nums focus:ring-0"
                                  placeholder="0"
                                />
                                <div className="absolute top-1 right-2 text-[8px] font-bold text-slate-300 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">Unit Cost</div>
                              </td>
                            ))}
                            <td className="p-3 bg-indigo-50/20">
                              <input 
                                type="number"
                                value={supply[i]}
                                onChange={(e) => {
                                  const newSupply = [...supply];
                                  newSupply[i] = parseInt(e.target.value) || 0;
                                  setSupply(newSupply);
                                }}
                                className="w-full p-4 bg-transparent border-0 outline-none text-center font-mono text-xl font-black text-indigo-700 tabular-nums"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-20">
                        <tr className="bg-slate-100 border-t-2 border-slate-200">
                          <td className="p-5 text-center font-bold text-[10px] uppercase tracking-widest text-slate-600 border-r border-slate-200 italic font-mono">需求量 (bj)</td>
                          {demand.map((d, j) => (
                            <td key={j} className="p-3 border-r border-slate-200">
                              <input 
                                type="number"
                                value={d}
                                onChange={(e) => {
                                  const newDemand = [...demand];
                                  newDemand[j] = parseInt(e.target.value) || 0;
                                  setDemand(newDemand);
                                }}
                                className="w-full p-4 bg-transparent border-0 outline-none text-center font-mono text-xl font-black text-slate-900 tabular-nums"
                              />
                            </td>
                          ))}
                          <td className="p-5 text-center font-mono font-black text-indigo-600 bg-indigo-100 flex flex-col items-center justify-center min-w-[120px]">
                            <span className="text-[9px] uppercase tracking-tighter opacity-70 mb-1">平衡校验</span>
                            {supply.reduce((a,b)=>a+b,0)} / {demand.reduce((a,b)=>a+b,0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="solving"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="flex justify-between items-end mb-8 shrink-0">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">运输平衡表 (求解中)</h2>
                    <p className="text-sm text-slate-500 mt-1 font-medium">MODI位势法与闭回路调整迭代中</p>
                  </div>
                  <div className="flex gap-3">
                     <div className="flex flex-col items-end mr-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {viewingIndex === history.length - 1 ? '当前最新迭代' : `查看历史步骤 ${viewingIndex}`}
                        </span>
                        <span className="text-xs font-bold text-indigo-600 max-w-[300px] truncate">{currentState?.message}</span>
                     </div>
                     <button 
                        disabled={latestState?.isOptimal && viewingIndex === history.length - 1}
                        onClick={nextStep}
                        className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-3 transition-all cursor-pointer ${
                          latestState?.isOptimal && viewingIndex === history.length - 1
                          ? 'bg-emerald-100 text-emerald-600 cursor-not-allowed opacity-50'
                          : 'bg-slate-900 text-white shadow-xl shadow-slate-200 hover:bg-slate-800 hover:translate-y-[-2px]'
                        }`}
                      >
                        {viewingIndex !== history.length - 1 ? (
                          <>
                            <ArrowRight size={16} />
                            跳转至最新
                          </>
                        ) : (
                          <>
                            {currentState?.isOptimal ? <CheckCircle2 size={16} /> : <ChevronRight size={16} />}
                            {currentState?.isOptimal ? '当前已最优' : '下一步迭代'}
                          </>
                        )}
                      </button>
                  </div>
                </div>

                <div className="flex-1 bg-white rounded-2xl shadow-2xl shadow-slate-200/60 border border-slate-200 flex flex-col overflow-hidden min-h-0">
                  <div className="overflow-auto flex-1">
                    <table className="w-full border-collapse border-spacing-0">
                      <thead className="sticky top-0 z-20">
                        <tr className="bg-slate-50/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
                          <th className="p-6 border-r border-slate-200 w-24"></th>
                          {currentState?.costs[0].map((_, j) => (
                            <th key={j} className="p-6 text-center border-r border-slate-100 min-w-[140px]">
                              <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 block mb-2">目的地 D{j + 1}</span>
                              <div className="bg-indigo-50 border border-indigo-100 rounded px-2 py-1 inline-block">
                                <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase mr-1">v{j+1} =</span>
                                <span className="font-mono font-black text-indigo-800 text-sm tracking-tighter">{currentState.v[j] ?? '--'}</span>
                              </div>
                            </th>
                          ))}
                          <th className="p-6 text-center font-bold text-[10px] uppercase tracking-widest text-indigo-600 bg-indigo-50/50 w-32 shadow-[-4px_0_12px_rgba(0,0,0,0.05)]">供应量 (ai)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentState?.costs.map((rowArr, i) => (
                          <tr key={i} className="group">
                            <td className="p-6 border-r border-slate-200 bg-slate-50/40 text-center relative shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
                              <span className="font-bold text-[10px] uppercase tracking-widest text-slate-400 block mb-2 italic">S{i + 1}</span>
                              <div className="bg-indigo-50 border border-indigo-100 rounded px-2 py-1 inline-block">
                                <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase mr-1">u{i+1} =</span>
                                <span className="font-mono font-black text-indigo-800 text-sm tracking-tighter">{currentState.u[i] ?? '--'}</span>
                              </div>
                            </td>
                            {rowArr.map((cost, j) => {
                              if (!currentState) return <td key={j}></td>;
                              const alloc = currentState.allocation[i][j];
                              const rc = currentState.reducedCosts[i][j];
                              const isEntering = currentState.enteringCell?.row === i && currentState.enteringCell?.col === j;
                              const isLeaving = currentState.leavingCell?.row === i && currentState.leavingCell?.col === j;
                              
                              const loopIdx = currentState.currentLoop?.findIndex(c => c.row === i && c.col === j);
                              const inLoop = loopIdx !== undefined && loopIdx !== -1;
                              const sign = inLoop ? (loopIdx % 2 === 0 ? '+' : '-') : '';

                              return (
                                <td 
                                  key={j} 
                                  className={`relative border-r border-slate-100 p-0 transition-all cursor-default group/cell overflow-hidden ${
                                    isEntering ? 'bg-amber-50/50 ring-2 ring-inset ring-amber-200 z-10' : 
                                    isLeaving ? 'bg-red-50/50 ring-2 ring-inset ring-red-100' : 
                                    alloc !== null ? 'bg-white' : 'hover:bg-indigo-50/30'
                                  } ${inLoop ? 'bg-indigo-50/40 outline-2 outline-dashed outline-indigo-200 outline-offset-[-4px]' : ''}`}
                                >
                                  {/* Cost Corner */}
                                  <div className={`absolute top-0 right-0 w-10 h-10 border-l border-b border-slate-100 flex items-center justify-center font-mono font-black text-[11px] italic transition-colors ${
                                    alloc !== null ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-300'
                                  }`}>
                                    {cost}
                                  </div>

                                  <div className="h-full w-full min-h-[110px] p-6 flex flex-col items-center justify-center relative">
                                    {alloc !== null ? (
                                      <motion.div 
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-2xl font-black text-indigo-600 tabular-nums font-mono"
                                      >
                                        {alloc}
                                      </motion.div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center">
                                        <span className="text-[10px] text-slate-200 font-bold uppercase tracking-widest mb-1 italic">Vacant</span>
                                        {rc !== null && (
                                          <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={`text-xs font-mono font-black px-2 py-0.5 rounded shadow-sm ${
                                              rc < 0 
                                              ? 'bg-red-100 text-red-600 border border-red-200 ring-2 ring-red-50' 
                                              : 'bg-slate-50 text-slate-400 opacity-40'
                                            }`}
                                          >
                                            λ = {rc}
                                          </motion.div>
                                        )}
                                      </div>
                                    )}

                                    {/* Closed Loop Visual Overlay */}
                                    {inLoop && (
                                      <motion.div 
                                        initial={{ scale: 1.2, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className={`absolute bottom-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shadow-lg ring-2 ring-white ${
                                          sign === '+' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                                        }`}
                                      >
                                        {sign}
                                      </motion.div>
                                    )}

                                    {isEntering && (
                                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-[9px] font-black rounded-md uppercase tracking-widest shadow-md">
                                        入基
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="p-6 bg-slate-50/50 font-mono font-black text-slate-900 border-l border-slate-200 text-center text-lg tabular-nums shadow-[-4px_0_12px_rgba(0,0,0,0.05)] w-32">
                              {currentState.supply[i]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-20">
                        <tr className="bg-slate-100 border-t-2 border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                          <td className="p-6 border-r border-slate-200 font-bold text-[10px] uppercase tracking-widest text-slate-600 text-center italic font-mono">需求 (bj)</td>
                          {currentState.demand.map((d, j) => (
                            <td key={j} className="p-6 border-r border-slate-100 font-mono font-black text-slate-900 text-center text-lg tabular-nums">
                              {d}
                            </td>
                          ))}
                          <td className="p-6 font-mono font-black text-indigo-700 bg-indigo-50 border-l border-slate-200 flex flex-col items-center justify-center w-32 whitespace-nowrap">
                            <span className="text-[10px] uppercase tracking-widest mb-1 opacity-60">Total Flow</span>
                            {currentState.supply.reduce((a,b)=>a+b,0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {currentState.isOptimal && (
                    <motion.div 
                      key="optimality-callout"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 p-4 px-8 bg-emerald-600 text-white rounded-3xl shadow-2xl flex items-center gap-6 ring-8 ring-white ring-offset-4 ring-offset-emerald-100"
                    >
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                        <CheckCircle2 size={28} />
                      </div>
                      <div>
                        <h3 className="font-black text-xl tracking-tight leading-none">最优解已确定 (Finished)</h3>
                        <p className="text-[11px] uppercase tracking-widest font-bold opacity-80 mt-1">最小总运费已锁定: ¥{currentState.totalCost}</p>
                      </div>
                      <button 
                        onClick={reset}
                        className="ml-4 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
                      >
                        <RotateCcw size={18} />
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Status / Hint Bar */}
      <footer className="h-10 bg-indigo-900 text-white flex items-center px-8 justify-between shrink-0 shadow-2xl z-20">
        <div className="flex items-center gap-3">
          <Activity size={12} className="text-indigo-400 animate-pulse" />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentState?.isOptimal ? 'bg-emerald-400' : 'bg-yellow-400'}`}></div>
            <span className="text-[10px] font-bold opacity-90 uppercase tracking-widest truncate max-w-[500px]">
              状态: {currentState?.isOptimal ? '最优方案锁定' : '算法迭代中'} {currentState?.message ? `| ${currentState.message}` : ''}
            </span>
          </div>
        </div>
        <div className="flex gap-6 shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold opacity-40 uppercase tracking-tighter">Algorithm</span>
            <span className="text-[10px] font-mono font-bold text-indigo-300">MODI + Loop</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold opacity-40 uppercase tracking-tighter">System</span>
            <span className="text-[10px] font-mono font-bold text-indigo-300">Geometric 1.0</span>
          </div>
        </div>
      </footer>
    </div>
    </PasswordGate>
  );
}
