const fs = require('fs');

let content = fs.readFileSync('src/components/SimulationViewport.tsx', 'utf-8');

// I inserted "Render Active Drawing Lines" into handleCanvasPointerUp by accident on line 695.
// Let's remove it from there.

const buggyBlock = `        // Render Active Drawing Lines
        if (st.isDrawingActive && st.drawingPoints.length > 0 && drawingGeoRef.current && drawingLineRef.current) {
          const pts: THREE.Vector3[] = [];
          for (const p of st.drawingPoints) {
            pts.push(new THREE.Vector3(p.x, 0.1, p.z));
          }

          if (st.interactionMode === 'DRAW_RECT') {
            // Draw dynamic rectangle
            const startPt = st.drawingPoints[0];
            if (point) {
              pts.push(new THREE.Vector3(point.x, 0.1, startPt.z));
              pts.push(new THREE.Vector3(point.x, 0.1, point.z));
              pts.push(new THREE.Vector3(startPt.x, 0.1, point.z));
            }
            pts.push(new THREE.Vector3(startPt.x, 0.1, startPt.z)); // close loop
          } else if (st.interactionMode === 'DRAW_POLY') {
            // Draw rubber band to current mouse pos
            if (point) {
              pts.push(new THREE.Vector3(point.x, 0.1, point.z));
            }
          }

          drawingGeoRef.current.setFromPoints(pts);
          drawingLineRef.current.visible = true;
        } else if (drawingLineRef.current) {
          drawingLineRef.current.visible = false;
        }`;

content = content.replace(buggyBlock, "");

// Now add it properly at the end of handlePointerMove

const searchMove = `      } else {
        ghostGroup.visible = false;
      }
    };`;

const replaceMove = `      } else {
        ghostGroup.visible = false;
      }

      // Render Active Drawing Lines
      if (st.isDrawingActive && st.drawingPoints.length > 0 && drawingGeoRef.current && drawingLineRef.current) {
        const pts: THREE.Vector3[] = [];
        for (const p of st.drawingPoints) {
          pts.push(new THREE.Vector3(p.x, 0.1, p.z));
        }

        if (st.interactionMode === 'DRAW_RECT') {
          // Draw dynamic rectangle
          const startPt = st.drawingPoints[0];
          if (point) {
            pts.push(new THREE.Vector3(point.x, 0.1, startPt.z));
            pts.push(new THREE.Vector3(point.x, 0.1, point.z));
            pts.push(new THREE.Vector3(startPt.x, 0.1, point.z));
          }
          pts.push(new THREE.Vector3(startPt.x, 0.1, startPt.z)); // close loop
        } else if (st.interactionMode === 'DRAW_POLY') {
          // Draw rubber band to current mouse pos
          if (point) {
            pts.push(new THREE.Vector3(point.x, 0.1, point.z));
          }
        }

        drawingGeoRef.current.setFromPoints(pts);
        drawingLineRef.current.visible = true;
      } else if (drawingLineRef.current) {
        drawingLineRef.current.visible = false;
      }
    };`;

content = content.replace(searchMove, replaceMove);

fs.writeFileSync('src/components/SimulationViewport.tsx', content, 'utf-8');
