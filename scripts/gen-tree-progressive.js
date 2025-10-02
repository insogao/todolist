/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.resolve(__dirname, '../public/data/graph.mmd');

// 纺锤体结构：从一个问题开始，经过多个调研方向，部分失败部分成功，最终汇聚到结论
// 使用图结构而非树结构，支持多父节点和汇聚
const fullGraph = {
  nodes: [
    { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },

    // 第一层：调研方向（发散）
    { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
    { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
    { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
    { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },

    // 第二层：具体调研（最宽处）
    { id: 'cf_user', title: '基于用户的CF', type: 'rect' },
    { id: 'cf_item', title: '基于物品的CF', type: 'rect' },
    { id: 'cf_matrix', title: '矩阵分解', type: 'rect' },

    { id: 'dl_cnn', title: 'CNN特征提取', type: 'rect' },
    { id: 'dl_rnn', title: 'RNN序列建模', type: 'rect' },
    { id: 'dl_transformer', title: 'Transformer架构', type: 'rect' },

    { id: 'hybrid_linear', title: '线性加权融合', type: 'rect' },
    { id: 'hybrid_stacking', title: 'Stacking集成', type: 'rect' },

    { id: 'cold_content', title: '基于内容的推荐', type: 'rect' },
    { id: 'cold_popularity', title: '流行度推荐', type: 'rect' },

    // 第三层：实验结果（部分失败）
    { id: 'result_cf_fail', title: '❌ CF效果不佳', type: 'rect' },
    { id: 'result_cnn_fail', title: '❌ CNN特征不足', type: 'rect' },
    { id: 'result_rnn_ok', title: '✓ RNN效果尚可', type: 'rect' },
    { id: 'result_transformer_good', title: '✓ Transformer效果优秀', type: 'rect' },
    { id: 'result_stacking_good', title: '✓ Stacking表现良好', type: 'rect' },
    { id: 'result_content_ok', title: '✓ 内容推荐可用', type: 'rect' },

    // 第四层：成功路径汇聚
    { id: 'insight_1', title: '洞察：序列建模是关键', type: 'rect' },
    { id: 'insight_2', title: '洞察：多模型融合有效', type: 'rect' },

    // 最终结论（汇聚）
    { id: 'conclusion', title: '✓ 最终方案：Transformer+Stacking混合推荐', type: 'circle' },
  ],
  edges: [
    // 从问题到调研方向
    { from: 'problem', to: 'approach_1' },
    { from: 'problem', to: 'approach_2' },
    { from: 'problem', to: 'approach_3' },
    { from: 'problem', to: 'approach_4' },

    // 调研方向到具体方法
    { from: 'approach_1', to: 'cf_user' },
    { from: 'approach_1', to: 'cf_item' },
    { from: 'approach_1', to: 'cf_matrix' },

    { from: 'approach_2', to: 'dl_cnn' },
    { from: 'approach_2', to: 'dl_rnn' },
    { from: 'approach_2', to: 'dl_transformer' },

    { from: 'approach_3', to: 'hybrid_linear' },
    { from: 'approach_3', to: 'hybrid_stacking' },

    { from: 'approach_4', to: 'cold_content' },
    { from: 'approach_4', to: 'cold_popularity' },

    // 具体方法到实验结果
    { from: 'cf_user', to: 'result_cf_fail' },
    { from: 'cf_item', to: 'result_cf_fail' },
    { from: 'cf_matrix', to: 'result_cf_fail' },

    { from: 'dl_cnn', to: 'result_cnn_fail' },
    { from: 'dl_rnn', to: 'result_rnn_ok' },
    { from: 'dl_transformer', to: 'result_transformer_good' },

    { from: 'hybrid_linear', to: 'result_stacking_good' },
    { from: 'hybrid_stacking', to: 'result_stacking_good' },

    { from: 'cold_content', to: 'result_content_ok' },

    // 实验结果到洞察（开始汇聚）
    { from: 'result_rnn_ok', to: 'insight_1' },
    { from: 'result_transformer_good', to: 'insight_1' },

    { from: 'result_stacking_good', to: 'insight_2' },
    { from: 'result_content_ok', to: 'insight_2' },

    // 洞察到最终结论（多条线汇聚到一个节点）
    { from: 'insight_1', to: 'conclusion' },
    { from: 'insight_2', to: 'conclusion' },
    { from: 'result_transformer_good', to: 'conclusion' },
  ]
};

// 逐步生成的阶段（渐进式生成纺锤体）
const phases = [
  // Phase 0: 核心问题
  {
    nodes: [{ id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' }],
    edges: []
  },

  // Phase 1: 四个调研方向（发散开始）
  {
    nodes: [
      { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },
      { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
      { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
      { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
      { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },
    ],
    edges: [
      { from: 'problem', to: 'approach_1' },
      { from: 'problem', to: 'approach_2' },
      { from: 'problem', to: 'approach_3' },
      { from: 'problem', to: 'approach_4' },
    ]
  },

  // Phase 2: 添加协同过滤的具体方法
  {
    nodes: [
      { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },
      { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
      { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
      { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
      { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },
      { id: 'cf_user', title: '基于用户的CF', type: 'rect' },
      { id: 'cf_item', title: '基于物品的CF', type: 'rect' },
      { id: 'cf_matrix', title: '矩阵分解', type: 'rect' },
    ],
    edges: [
      { from: 'problem', to: 'approach_1' },
      { from: 'problem', to: 'approach_2' },
      { from: 'problem', to: 'approach_3' },
      { from: 'problem', to: 'approach_4' },
      { from: 'approach_1', to: 'cf_user' },
      { from: 'approach_1', to: 'cf_item' },
      { from: 'approach_1', to: 'cf_matrix' },
    ]
  },

  // Phase 3: 添加深度学习方法（最宽处）
  {
    nodes: [
      { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },
      { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
      { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
      { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
      { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },
      { id: 'cf_user', title: '基于用户的CF', type: 'rect' },
      { id: 'cf_item', title: '基于物品的CF', type: 'rect' },
      { id: 'cf_matrix', title: '矩阵分解', type: 'rect' },
      { id: 'dl_cnn', title: 'CNN特征提取', type: 'rect' },
      { id: 'dl_rnn', title: 'RNN序列建模', type: 'rect' },
      { id: 'dl_transformer', title: 'Transformer架构', type: 'rect' },
      { id: 'hybrid_linear', title: '线性加权融合', type: 'rect' },
      { id: 'hybrid_stacking', title: 'Stacking集成', type: 'rect' },
      { id: 'cold_content', title: '基于内容的推荐', type: 'rect' },
      { id: 'cold_popularity', title: '流行度推荐', type: 'rect' },
    ],
    edges: [
      { from: 'problem', to: 'approach_1' },
      { from: 'problem', to: 'approach_2' },
      { from: 'problem', to: 'approach_3' },
      { from: 'problem', to: 'approach_4' },
      { from: 'approach_1', to: 'cf_user' },
      { from: 'approach_1', to: 'cf_item' },
      { from: 'approach_1', to: 'cf_matrix' },
      { from: 'approach_2', to: 'dl_cnn' },
      { from: 'approach_2', to: 'dl_rnn' },
      { from: 'approach_2', to: 'dl_transformer' },
      { from: 'approach_3', to: 'hybrid_linear' },
      { from: 'approach_3', to: 'hybrid_stacking' },
      { from: 'approach_4', to: 'cold_content' },
      { from: 'approach_4', to: 'cold_popularity' },
    ]
  },

  // Phase 4: 添加实验结果（部分失败）
  {
    nodes: [
      { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },
      { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
      { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
      { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
      { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },
      { id: 'cf_user', title: '基于用户的CF', type: 'rect' },
      { id: 'cf_item', title: '基于物品的CF', type: 'rect' },
      { id: 'cf_matrix', title: '矩阵分解', type: 'rect' },
      { id: 'dl_cnn', title: 'CNN特征提取', type: 'rect' },
      { id: 'dl_rnn', title: 'RNN序列建模', type: 'rect' },
      { id: 'dl_transformer', title: 'Transformer架构', type: 'rect' },
      { id: 'hybrid_linear', title: '线性加权融合', type: 'rect' },
      { id: 'hybrid_stacking', title: 'Stacking集成', type: 'rect' },
      { id: 'cold_content', title: '基于内容的推荐', type: 'rect' },
      { id: 'cold_popularity', title: '流行度推荐', type: 'rect' },
      { id: 'result_cf_fail', title: '❌ CF效果不佳', type: 'rect' },
      { id: 'result_cnn_fail', title: '❌ CNN特征不足', type: 'rect' },
      { id: 'result_rnn_ok', title: '✓ RNN效果尚可', type: 'rect' },
      { id: 'result_transformer_good', title: '✓ Transformer效果优秀', type: 'rect' },
      { id: 'result_stacking_good', title: '✓ Stacking表现良好', type: 'rect' },
      { id: 'result_content_ok', title: '✓ 内容推荐可用', type: 'rect' },
    ],
    edges: [
      { from: 'problem', to: 'approach_1' },
      { from: 'problem', to: 'approach_2' },
      { from: 'problem', to: 'approach_3' },
      { from: 'problem', to: 'approach_4' },
      { from: 'approach_1', to: 'cf_user' },
      { from: 'approach_1', to: 'cf_item' },
      { from: 'approach_1', to: 'cf_matrix' },
      { from: 'approach_2', to: 'dl_cnn' },
      { from: 'approach_2', to: 'dl_rnn' },
      { from: 'approach_2', to: 'dl_transformer' },
      { from: 'approach_3', to: 'hybrid_linear' },
      { from: 'approach_3', to: 'hybrid_stacking' },
      { from: 'approach_4', to: 'cold_content' },
      { from: 'approach_4', to: 'cold_popularity' },
      { from: 'cf_user', to: 'result_cf_fail' },
      { from: 'cf_item', to: 'result_cf_fail' },
      { from: 'cf_matrix', to: 'result_cf_fail' },
      { from: 'dl_cnn', to: 'result_cnn_fail' },
      { from: 'dl_rnn', to: 'result_rnn_ok' },
      { from: 'dl_transformer', to: 'result_transformer_good' },
      { from: 'hybrid_linear', to: 'result_stacking_good' },
      { from: 'hybrid_stacking', to: 'result_stacking_good' },
      { from: 'cold_content', to: 'result_content_ok' },
    ]
  },

  // Phase 5: 添加洞察（开始汇聚）
  {
    nodes: [
      { id: 'problem', title: '核心问题：如何提升推荐系统准确率', type: 'circle' },
      { id: 'approach_1', title: '方向A：协同过滤优化', type: 'rect' },
      { id: 'approach_2', title: '方向B：深度学习模型', type: 'rect' },
      { id: 'approach_3', title: '方向C：混合推荐', type: 'rect' },
      { id: 'approach_4', title: '方向D：冷启动解决', type: 'rect' },
      { id: 'cf_user', title: '基于用户的CF', type: 'rect' },
      { id: 'cf_item', title: '基于物品的CF', type: 'rect' },
      { id: 'cf_matrix', title: '矩阵分解', type: 'rect' },
      { id: 'dl_cnn', title: 'CNN特征提取', type: 'rect' },
      { id: 'dl_rnn', title: 'RNN序列建模', type: 'rect' },
      { id: 'dl_transformer', title: 'Transformer架构', type: 'rect' },
      { id: 'hybrid_linear', title: '线性加权融合', type: 'rect' },
      { id: 'hybrid_stacking', title: 'Stacking集成', type: 'rect' },
      { id: 'cold_content', title: '基于内容的推荐', type: 'rect' },
      { id: 'cold_popularity', title: '流行度推荐', type: 'rect' },
      { id: 'result_cf_fail', title: '❌ CF效果不佳', type: 'rect' },
      { id: 'result_cnn_fail', title: '❌ CNN特征不足', type: 'rect' },
      { id: 'result_rnn_ok', title: '✓ RNN效果尚可', type: 'rect' },
      { id: 'result_transformer_good', title: '✓ Transformer效果优秀', type: 'rect' },
      { id: 'result_stacking_good', title: '✓ Stacking表现良好', type: 'rect' },
      { id: 'result_content_ok', title: '✓ 内容推荐可用', type: 'rect' },
      { id: 'insight_1', title: '洞察：序列建模是关键', type: 'rect' },
      { id: 'insight_2', title: '洞察：多模型融合有效', type: 'rect' },
    ],
    edges: [
      { from: 'problem', to: 'approach_1' },
      { from: 'problem', to: 'approach_2' },
      { from: 'problem', to: 'approach_3' },
      { from: 'problem', to: 'approach_4' },
      { from: 'approach_1', to: 'cf_user' },
      { from: 'approach_1', to: 'cf_item' },
      { from: 'approach_1', to: 'cf_matrix' },
      { from: 'approach_2', to: 'dl_cnn' },
      { from: 'approach_2', to: 'dl_rnn' },
      { from: 'approach_2', to: 'dl_transformer' },
      { from: 'approach_3', to: 'hybrid_linear' },
      { from: 'approach_3', to: 'hybrid_stacking' },
      { from: 'approach_4', to: 'cold_content' },
      { from: 'approach_4', to: 'cold_popularity' },
      { from: 'cf_user', to: 'result_cf_fail' },
      { from: 'cf_item', to: 'result_cf_fail' },
      { from: 'cf_matrix', to: 'result_cf_fail' },
      { from: 'dl_cnn', to: 'result_cnn_fail' },
      { from: 'dl_rnn', to: 'result_rnn_ok' },
      { from: 'dl_transformer', to: 'result_transformer_good' },
      { from: 'hybrid_linear', to: 'result_stacking_good' },
      { from: 'hybrid_stacking', to: 'result_stacking_good' },
      { from: 'cold_content', to: 'result_content_ok' },
      { from: 'result_rnn_ok', to: 'insight_1' },
      { from: 'result_transformer_good', to: 'insight_1' },
      { from: 'result_stacking_good', to: 'insight_2' },
      { from: 'result_content_ok', to: 'insight_2' },
    ]
  },

  // Phase 6: 最终结论（完全汇聚）
  fullGraph,
];

function generateMermaidFromGraph(graph, direction = 'LR') {
  const lines = [`graph ${direction}`];
  const nodeLines = [];
  const edgeLines = [];

  // 生成节点定义
  graph.nodes.forEach(node => {
    const { id, title, type } = node;
    if (type === 'circle') {
      nodeLines.push(`${id}((${title}))`);
    } else {
      nodeLines.push(`${id}[${title}]`);
    }
  });

  // 生成边定义
  graph.edges.forEach(edge => {
    edgeLines.push(`${edge.from} --> ${edge.to}`);
  });

  return [...lines, ...nodeLines, ...edgeLines].join('\n');
}

fs.mkdirSync(path.dirname(target), { recursive: true });

let currentPhase = 0;

function writePhase() {
  if (currentPhase >= phases.length) {
    console.log('🎉 所有阶段生成完毕！');
    console.log('✅ 数据文件已保存，刷新页面可直接加载');
    process.exit(0);
  }

  const graph = phases[currentPhase];
  const content = generateMermaidFromGraph(graph, 'LR');
  fs.writeFileSync(target, content, 'utf8');

  console.log(`✅ Phase ${currentPhase + 1}/${phases.length} -> 已生成`);
  currentPhase++;

  // 最后一次写入时，确保写入完整数据
  if (currentPhase >= phases.length) {
    const finalGraph = phases[phases.length - 1];
    const finalContent = generateMermaidFromGraph(finalGraph, 'LR');
    fs.writeFileSync(target, finalContent, 'utf8');
    console.log('💾 完整数据已保存到文件');
  }
}

// 立即生成第一阶段
writePhase();

// 每5秒生成下一阶段（延长观察时间）
const interval = setInterval(() => {
  writePhase();
  if (currentPhase >= phases.length) {
    clearInterval(interval);
  }
}, 5000);
