Pod::Spec.new do |s|
  s.name = 'EspartanaReader'
  s.version = '0.1.0'
  s.summary = 'Lectura local de PDF para La Espartana'
  s.description = 'Extracción de texto y posiciones mediante PDFKit, sin subir documentos.'
  s.license = { :type => 'MIT' }
  s.author = 'La Espartana'
  s.homepage = 'https://www.loteria300.es'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'Vision', 'ImageIO'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end
