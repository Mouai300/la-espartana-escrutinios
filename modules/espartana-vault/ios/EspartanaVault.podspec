Pod::Spec.new do |s|
  s.name = 'EspartanaVault'
  s.version = '0.1.0'
  s.summary = 'Protección local y copias de La Espartana'
  s.description = 'Keychain con presencia de usuario y copias autenticadas mediante CryptoKit.'
  s.license = { :type => 'MIT' }
  s.author = 'La Espartana'
  s.homepage = 'https://www.loteria300.es'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Security', 'LocalAuthentication', 'CryptoKit', 'UIKit', 'WebKit'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end
