# Tieba-API-SCF

![GitHub Repo stars](https://img.shields.io/github/stars/Dilettante258/Tieba-API-SCF)
![GitHub forks](https://img.shields.io/github/forks/Dilettante258/Tieba-API-SCF)

对百度贴吧的一些常用API进行了的调用时转发封装。

该项目是一个基于Node.js运行时的API服务器，使用[Hono](https://hono.dev/)框架进行开发，使用了zod作类型验证并生成了OpenAPI文档，用[Scalar](https://scalar.com/)作API展示。

## 体验地址

**[Reference](https://tb.wang1m.tech/reference)**

此分支部署在华为云函数上。有CORS限制，若想用于其他的项目中，请自行部署。

## 部署教程
先需要设置`BDUSS`环境变量，否则直接抛出错误。
- **本地部署**
    ```bash
    npm install
    npm run dev
    ```
  打开 http://localhost:8000/reference 可直接体验。
- **云函数部署**
  ```bash
  npm install
  npm run build
    ```
  将打包生成的`out.cjs`上传，并相应配置好对应的bootstrap即可运行。
    
  不建议部署至国外的云服务平台（例如AWS/CF)，因为延迟很高。


## 注意事项
请勿以本项目进行违反百度贴吧用户协议的行为，或向任何第三方提供任何形式的相关服务。
使用此库时请仅用于学习和测试，禁止用于非法用途及其他恶劣的社区行为如：恶意刷屏、辱骂黄暴、各种形式的滥用等。
由此违规而产生的任何后果自负，模块的所有贡献者不负任何责任。






