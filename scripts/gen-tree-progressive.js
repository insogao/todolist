/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const target = path.resolve(__dirname, '../public/data/graph.mmd');

// 定义完整的树形结构
const fullTree = {
  root: {
    id: 'research_goal',
    title: '深度学习研究项目',
    type: 'rect',
    children: [
      {
        id: 'problem_analysis',
        title: '问题分析',
        type: 'rect',
        children: [
          {
            id: 'data_preprocessing',
            title: '数据预处理',
            type: 'rect',
            children: [
              { id: 'data_cleaning', title: '数据清洗', type: 'rect' },
              { id: 'feature_extraction', title: '特征提取', type: 'rect' },
              { id: 'data_augmentation', title: '数据增强', type: 'rect' },
            ]
          },
          {
            id: 'model_selection',
            title: '模型选择',
            type: 'rect',
            children: [
              { id: 'cnn_model', title: 'CNN 架构', type: 'rect' },
              { id: 'transformer', title: 'Transformer 模型', type: 'rect' },
            ]
          }
        ]
      },
      {
        id: 'implementation',
        title: '实现阶段',
        type: 'rect',
        children: [
          {
            id: 'training',
            title: '模型训练',
            type: 'rect',
            children: [
              { id: 'hyperparameter', title: '超参数调优', type: 'rect' },
              { id: 'validation', title: '验证与测试', type: 'rect' },
            ]
          },
          {
            id: 'optimization',
            title: '性能优化',
            type: 'rect',
            children: [
              { id: 'speed_opt', title: '推理速度优化', type: 'rect' },
              { id: 'accuracy_opt', title: '准确率提升', type: 'rect' },
            ]
          }
        ]
      },
      {
        id: 'evaluation',
        title: '评估与分析',
        type: 'circle',
        children: [
          { id: 'metrics', title: '性能指标评估', type: 'rect' },
          { id: 'comparison', title: '对比分析', type: 'rect' },
        ]
      }
    ]
  }
};

// 逐步生成的阶段
const phases = [
  // Phase 0: 只有根节点
  { root: { id: 'research_goal', title: '深度学习研究项目', type: 'rect', children: [] } },

  // Phase 1: 第一层（3个主分支）
  {
    root: {
      id: 'research_goal',
      title: '深度学习研究项目',
      type: 'rect',
      children: [
        { id: 'problem_analysis', title: '问题分析', type: 'rect', children: [] },
        { id: 'implementation', title: '实现阶段', type: 'rect', children: [] },
        { id: 'evaluation', title: '评估与分析', type: 'circle', children: [] },
      ]
    }
  },

  // Phase 2: 问题分析的子节点
  {
    root: {
      id: 'research_goal',
      title: '深度学习研究项目',
      type: 'rect',
      children: [
        {
          id: 'problem_analysis',
          title: '问题分析',
          type: 'rect',
          children: [
            { id: 'data_preprocessing', title: '数据预处理', type: 'rect', children: [] },
            { id: 'model_selection', title: '模型选择', type: 'rect', children: [] },
          ]
        },
        { id: 'implementation', title: '实现阶段', type: 'rect', children: [] },
        { id: 'evaluation', title: '评估与分析', type: 'circle', children: [] },
      ]
    }
  },

  // Phase 3: 数据预处理的子节点
  {
    root: {
      id: 'research_goal',
      title: '深度学习研究项目',
      type: 'rect',
      children: [
        {
          id: 'problem_analysis',
          title: '问题分析',
          type: 'rect',
          children: [
            {
              id: 'data_preprocessing',
              title: '数据预处理',
              type: 'rect',
              children: [
                { id: 'data_cleaning', title: '数据清洗', type: 'rect' },
                { id: 'feature_extraction', title: '特征提取', type: 'rect' },
              ]
            },
            { id: 'model_selection', title: '模型选择', type: 'rect', children: [] },
          ]
        },
        { id: 'implementation', title: '实现阶段', type: 'rect', children: [] },
        { id: 'evaluation', title: '评估与分析', type: 'circle', children: [] },
      ]
    }
  },

  // Phase 4: 更多节点
  {
    root: {
      id: 'research_goal',
      title: '深度学习研究项目',
      type: 'rect',
      children: [
        {
          id: 'problem_analysis',
          title: '问题分析',
          type: 'rect',
          children: [
            {
              id: 'data_preprocessing',
              title: '数据预处理',
              type: 'rect',
              children: [
                { id: 'data_cleaning', title: '数据清洗', type: 'rect' },
                { id: 'feature_extraction', title: '特征提取', type: 'rect' },
                { id: 'data_augmentation', title: '数据增强', type: 'rect' },
              ]
            },
            {
              id: 'model_selection',
              title: '模型选择',
              type: 'rect',
              children: [
                { id: 'cnn_model', title: 'CNN 架构', type: 'rect' },
              ]
            },
          ]
        },
        { id: 'implementation', title: '实现阶段', type: 'rect', children: [] },
        { id: 'evaluation', title: '评估与分析', type: 'circle', children: [] },
      ]
    }
  },

  // Phase 5: 实现阶段的子节点
  {
    root: {
      id: 'research_goal',
      title: '深度学习研究项目',
      type: 'rect',
      children: [
        {
          id: 'problem_analysis',
          title: '问题分析',
          type: 'rect',
          children: [
            {
              id: 'data_preprocessing',
              title: '数据预处理',
              type: 'rect',
              children: [
                { id: 'data_cleaning', title: '数据清洗', type: 'rect' },
                { id: 'feature_extraction', title: '特征提取', type: 'rect' },
                { id: 'data_augmentation', title: '数据增强', type: 'rect' },
              ]
            },
            {
              id: 'model_selection',
              title: '模型选择',
              type: 'rect',
              children: [
                { id: 'cnn_model', title: 'CNN 架构', type: 'rect' },
                { id: 'transformer', title: 'Transformer 模型', type: 'rect' },
              ]
            },
          ]
        },
        {
          id: 'implementation',
          title: '实现阶段',
          type: 'rect',
          children: [
            { id: 'training', title: '模型训练', type: 'rect', children: [] },
            { id: 'optimization', title: '性能优化', type: 'rect', children: [] },
          ]
        },
        { id: 'evaluation', title: '评估与分析', type: 'circle', children: [] },
      ]
    }
  },

  // Phase 6: 完整树
  fullTree,
];

function generateMermaidFromTree(tree, direction = 'LR') {
  const lines = [`graph ${direction}`];
  const nodes = [];
  const edges = [];

  function traverse(node, parent = null) {
    const nodeId = node.id;
    const nodeTitle = node.title;
    const nodeType = node.type || 'rect';

    if (nodeType === 'circle') {
      nodes.push(`${nodeId}((${nodeTitle}))`);
    } else {
      nodes.push(`${nodeId}[${nodeTitle}]`);
    }

    if (parent) {
      edges.push(`${parent} --> ${nodeId}`);
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, nodeId));
    }
  }

  traverse(tree.root);

  return [...lines, ...nodes, ...edges].join('\n');
}

fs.mkdirSync(path.dirname(target), { recursive: true });

let currentPhase = 0;

function writePhase() {
  if (currentPhase >= phases.length) {
    console.log('🎉 所有阶段生成完毕！');
    console.log('✅ 数据文件已保存，刷新页面可直接加载');
    process.exit(0);
  }

  const tree = phases[currentPhase];
  const content = generateMermaidFromTree(tree, 'LR');
  fs.writeFileSync(target, content, 'utf8');

  console.log(`✅ Phase ${currentPhase + 1}/${phases.length} -> 已生成`);
  currentPhase++;

  // 最后一次写入时，确保写入完整数据
  if (currentPhase >= phases.length) {
    const finalTree = phases[phases.length - 1];
    const finalContent = generateMermaidFromTree(finalTree, 'LR');
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
