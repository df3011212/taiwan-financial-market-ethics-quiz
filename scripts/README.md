# 題集維護與驗證

在儲存庫根目錄執行：

```sh
python scripts/build_similarity_catalog.py
node scripts/test-similarity-tracker.cjs
node scripts/test-similarity-integration.cjs
```

重建只更新 `assets/similarity-data.js`，不改動原始題目與官方答案。測試涵蓋作答去重、連續答對、測驗交卷、聽題排除、PDF 跳題與分組返回。
