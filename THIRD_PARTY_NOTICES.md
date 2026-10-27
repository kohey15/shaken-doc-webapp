# Local OCR components

The OCR pipeline runs in the user's browser. Model files are downloaded from the same origin as the app; photos are not uploaded for recognition.

| Component | Version | License / source |
| --- | --- | --- |
| PaddleOCR.js | 0.4.2 | Apache-2.0; PaddlePaddle Authors, https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js |
| PP-OCRv5 mobile detection and recognition models | PP-OCRv5 | Apache-2.0; https://github.com/PaddlePaddle/PaddleOCR |
| OpenCV.js (@techstark/opencv-js) | 4.10.0-release.1 | Apache-2.0; https://github.com/TechStark/opencv-js |
| ONNX Runtime Web and Common | 1.30.0 | MIT; Microsoft Corporation, https://github.com/microsoft/onnxruntime |
| Clipper / clipper-lib | 6.4.2 | Boost Software License 1.0; Angus Johnson 2010-2017; JavaScript translation by Timo |
| js-yaml | 4.3.2 | MIT; https://github.com/nodeca/js-yaml |
| FlatBuffers | See package-lock.json | Apache-2.0; https://github.com/google/flatbuffers |

License texts and notices are distributed under `assets/ocr/v5/licenses/`. The generated JavaScript retains bundled license comments. Existing PDF/font dependencies retain their original licenses.

Model download sources (no photograph is included in these requests):

- https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar
- https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar

Rebuild with `npm ci` and `npm run build:ocr`. Ordinary hosting serves the prebuilt assets and does not require Node.js.
