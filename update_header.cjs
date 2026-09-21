const fs = require('fs');

let content = fs.readFileSync('src/components/SimulationViewport.tsx', 'utf-8');

// Replace header title
const headerSearch = `<div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#8A6826]" />
            <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
              3D CAD WAREHOUSE CONSTRUCTOR
            </h3>
          </div>`;

const headerReplace = `{isConstructorMode ? (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#8A6826]" />
              <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
                [ REO CAD CONSTRUCTOR ] • [ {facility.name || 'Проект склада #1'} ] • [ Режим: Чертеж ]
              </h3>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#8A6826]" />
              <h3 className="font-bold uppercase tracking-tight text-[#1A1A1A]">
                3D CAD WAREHOUSE CONSTRUCTOR
              </h3>
            </div>
          )}`;

content = content.replace(headerSearch, headerReplace);

// Hide badges in constructor mode
const badgesSearch = `<div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
            <MapPin className="w-3.5 h-3.5 text-purple-600" />
            <span>
              Зон: <strong className="text-[#1A1A1A]">{topology.zones.length}</strong>
            </span>
          </div>

          <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
            <Navigation className="w-3.5 h-3.5 text-sky-600" />
            <span>
              Трассы:{' '}
              <strong className="text-[#1A1A1A] tabular-nums">{totalPathLengthM} м</strong> (
              {topology.nodes.length} узлов)
            </span>
          </div>`;

const badgesReplace = `{!isConstructorMode && (
            <>
              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>
                  Зон: <strong className="text-[#1A1A1A]">{topology.zones.length}</strong>
                </span>
              </div>

              <div className="bg-[#F9F9F6] border border-[#D4AF37]/30 px-2 py-1 flex items-center gap-1.5 text-[#4F4F47]">
                <Navigation className="w-3.5 h-3.5 text-sky-600" />
                <span>
                  Трассы:{' '}
                  <strong className="text-[#1A1A1A] tabular-nums">{totalPathLengthM} м</strong> (
                  {topology.nodes.length} узлов)
                </span>
              </div>
            </>
          )}`;

content = content.replace(badgesSearch, badgesReplace);

fs.writeFileSync('src/components/SimulationViewport.tsx', content, 'utf-8');
